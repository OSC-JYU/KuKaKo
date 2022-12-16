const axios = require("axios")
const path = require('path')
const JSON5 = require('json5')
const yaml = require('js-yaml')
const fsPromises = require('fs/promises')

const web = require("./web.js")


let schema = {}

schema.getSchema = async function(label) {
	var query = ''
	if(label)
		query = `MATCH (s:Schema {_type:"${label}"}) -[rel]- (t:Schema) RETURN s, rel ,t, COALESCE(t.label, t._type) as label ORDER by rel.display DESC`
	else
		query = `MATCH (s:Schema ) -[rel]-(t:Schema) RETURN s, rel, t`
	var result = await web.cypher(query)
	var out = []
	for(var schema of result.result) {

		if(schema.s['@rid'] == schema.rel['@out']) {
			out.push({
				type:schema.rel['@type'],
				label: schema.rel['label'],
				target: schema.t['_type'],
				target_label: schema['label'],
				target_publicity: schema.t['_public'],
				display: schema.rel['display'],
				tags: schema.rel['tags']
			})
		} else {
			out.push({
				type:schema.rel['@type'],
				label: schema.rel['label_rev'],
				target: schema.t['_type'],
				target_label: schema['label'],
				target_publicity: schema.t['_public'],
				tags: schema.rel['tags'],
				reverse: 1
			})
		}
	}

	return out
}

schema.getSchemaTypes = async function() {
	var query = 'MATCH (schema:Schema) RETURN id(schema) as rid, COALESCE(schema.label, schema._type) as label, schema._type as type, schema ORDER by label'
	return await web.cypher( query)
}

schema.getSchemaAttributes = async function(schema, data_obj) {
	var query = `MATCH (s:Schema) WHERE s._type = "${schema}" RETURN s`
	var response = await web.cypher( query)
	if(response.result && response.result.length) {
		for(var key in response.result[0]) {
			if(!(key in data_obj)) data_obj[key] = ''
		}
		return data_obj
	} else return data_obj
}


schema.exportSchemaYAML = async function(filename) {
	if(!filename) throw('You need to give a file name! ')
	var vertex_ids = {}
	var edge_ids = {}
	var query = 'MATCH (schema:Schema) OPTIONAL MATCH (schema)-[r]-(schema2:Schema) RETURN schema, r, schema2 '
	var schemas = await web.cypher( query, {serializer: 'graph'})
	var output = {nodes: [], edges: []}
	for(var vertex of schemas.result.vertices) {
		if(!vertex_ids[vertex.r]) {
			 var node_obj = {}
			 node_obj[vertex.p._type] = {...vertex.p}
			 // make sure there is label property
			 if(!node_obj[vertex.p._type].label) node_obj[vertex.p._type].label = vertex.p._type

			 delete(node_obj[vertex.p._type]._active)
			 delete(node_obj[vertex.p._type]._type)
			 output.nodes.push(node_obj)
			 vertex_ids[vertex.r] = vertex.p._type
		}
	}
	for(var edge of schemas.result.edges) {

		var to = vertex_ids[edge.i]
		var from = vertex_ids[edge.o]
		var edge_name = from + ':' + edge.t + ':' + to
		if(!edge_ids[edge_name]) {
			var edge_obj = {}
			edge_obj[edge_name] = {label: edge.p.label, label_rev: edge.p.label_rev}
			output.edges.push(edge_obj)
			edge_ids[edge_name] = edge_obj
		}


	}
	const filePath = path.resolve('./schemas', filename)
	await fsPromises.writeFile(filePath, yaml.dump(output), 'utf8')
	return {file: filePath}
}



schema.importSchemaYAML = async function(filename, mode) {
	console.log(`** importing schema ${filename} **`)
	try {
		if(mode == 'clear') {
			// make sure that system nodes are allways present
			const filePathSystem = path.resolve('./schemas', filename)
			const system_schema = await fsPromises.readFile(filePathSystem, 'utf8')
			var query = 'MATCH (s:Schema) DETACH DELETE s'
			var result = await web.cypher( query)
			const system_schema_data = yaml.load(system_schema)
			await writeSchemaToDB(system_schema_data)
		}
		const filePath = path.resolve('./schemas', filename)
		const data = await fsPromises.readFile(filePath, 'utf8')
		const schema = yaml.load(data)
		await writeSchemaToDB(schema)
	} catch (e) {
		throw(e)
	}
	console.log('** Done import **')
}



schema.importSystemSchema = async function() {
	await this.importSchemaYAML('.system.yaml')
}



async function writeSchemaToDB(schema) {
	try {
		for(var node of schema.nodes) {
			const type = Object.keys(node)[0]
			var attributes = []
			for(var key of Object.keys(node[type])) {
				attributes.push(`s.${key} = "${node[type][key]}"`)
			}
			attributes.push(`s._type = "${type}"`)
			node[type].type = type
			var insert = `MERGE (s:Schema {_type: "${type}"}) SET ${attributes.join(',')}`
			var reponse = await web.cypher( insert)
		}

		for(var edge of schema.edges) {
			const type = Object.keys(edge)[0]
			var edge_parts = type.split(':')
			var link_query = `MATCH (from:Schema {_type: "${edge_parts[0]}"}), (to: Schema {_type:"${edge_parts[2]}"}) MERGE (from)-[r:${edge_parts[1]}]->(to) SET r.label ="${edge[type].label}", r.label_rev = "${edge[type].label_rev}"`
			var reponse = await web.cypher( link_query)
		}
	} catch (e) {
		throw(e)
	}
}

module.exports = schema
