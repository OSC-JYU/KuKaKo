const axios = require("axios")
const path = require('path')
const JSON5 = require('json5')
const yaml = require('js-yaml')
const fsPromises = require('fs/promises')

const schema = require("./schema.js")
const web = require("./web.js")

const MAX_STR_LENGTH = 2048
const DB_HOST = process.env.ARCADEDB_HOST || 'localhost'
const DB = process.env.ARCADEDB_DB || 'kukako'
const URL = `http://${DB_HOST}:2480/api/v1/command/${DB}`

// Assigning to exports will not modify module, must use module.exports
module.exports = class Graph {

	async initDB(docIndex) {
		console.log('Checking database...')
		this.docIndex = docIndex
		var query = 'MATCH (n:Schema) return n'
		try {
			var result = await web.cypher(URL, query)
		} catch(e) {
			try {
				console.log('Database not found, creating...')
				await web.createDB(URL)
			} catch (e) {
				console.log(`Could not init database. \nIs Arcadedb running at ${URL}?`)
				process.exit(1)
			}
		}
		await this.setSystemNodes()
	}


	async setSystemNodes() {
		try {
			// database exist, make sure that some base types are present
			await web.createVertexType(URL, 'Schema')
			await web.createVertexType(URL, 'Person')
			await web.createVertexType(URL, 'UserGroup')
			await web.createVertexType(URL, 'Menu')
			await web.createVertexType(URL, 'Query')
			await web.createVertexType(URL, 'Layout')
			await web.createVertexType(URL, 'Tag')
			await web.createVertexType(URL, 'NodeGroup')
			await schema.importSystemSchema()
			await this.createSystemGraph()
			// Make sure that base system graph exists


		} catch(e) {
			console.log(e)
			console.log(`Could not init system, exiting...`)
			process.exit(1)
		}

	}


	async createSystemGraph() {
		try {
			// Menu "Me"
			var query = 'MERGE (m:Menu {id:"me"}) SET m.label = "Me", m._active = true RETURN m'
			var menu = await web.cypher(URL, query, null, 1)
			// Usergroup "Basic"
			query = 'MERGE (m:UserGroup {id:"user"}) SET m.label = "User", m._active = true RETURN m'
			var group = await web.cypher(URL, query, null, 1)

			// Make sure that "Me" menu is linked to the "User" group
			query = `MATCH (m:Menu), (g:UserGroup) WHERE id(m) = "${menu.result[0]['@rid']}" AND id(g) = "${group.result[0]['@rid']}" MERGE (m)-[:VISIBLE_FOR_GROUP]->(g)`
			await web.cypher(URL, query, null, 1)

			// default local user
			query = `MERGE (p:Person {id:"local.user@localhost"}) SET p._group = "user", p._access = "admin", p._active = true, p.label = "Local You", p.description = "It's really You!" RETURN p`
			await web.cypher(URL, query, null, 1)
		} catch (e) {
			console.log(query)
			throw('System graph creation failed')
		}
	}


	async createIndex() {
		console.log('Starting to index...')
		var query = 'MATCH (n) return id(n) as id, n.label as label'
		try {
			var result = await web.cypher(URL, query)
			try {
				for (var node of result.result) {
					this.docIndex.add(node)
				}
				console.log('Indexing done')
			} catch(e) {
				// if indexing fails, then we have a problem and we quit
				console.log('Indexing failed, exiting...')
				console.log(e)
				process.exit(1)
			}

		} catch(e) {
			console.log(`Could not find database. \nIs Arcadedb running at ${URL}?`)
			process.exit(1)
		}

	}

	async query(body) {
		return web.cypher(URL, body.query)
	}

	async create(type, data) {
        var data_str_arr = []
		const fields = ['label', 'tags', 'id', 'description', 'URL', 'repository', 'description', 'query', 'layout', '_access', 'scale', 'image', '_type']
		// expression data to string
		for(var key of fields) {
			if(data[key]) {
				if(Array.isArray(data[key]) && data[key].length > 0) {
					data[key] = data[key].map(i => `'${i}'`).join(',')
					data_str_arr.push(`${key}:[${data[key]}]`)
				} else {
				    if(data[key].length > MAX_STR_LENGTH) throw('Too long data!')
				    data_str_arr.push(`${key}:"${data[key].replace(/"/g, '\\"')}"`)
				}
            }
		}
		// set some system attributes to all Persons
		if(type === 'Person') {
			if(!data['_group']) data_str_arr.push(`_group: "user"`) // default user group for all persons
			if(!data['_access']) data_str_arr.push(`_access: "user"`) // default access for all persons
		}
		// _active
		data_str_arr.push(`_active: true`)

		var query = `CREATE (n:${type} {${data_str_arr.join(',')}}) return n`
        console.log(query)
		return web.cypher(URL, query)
	}


	async merge(type, node) {
		var attributes = []
		for(var key of Object.keys(node[type])) {
			attributes.push(`s.${key} = "${node[type][key]}"`)
		}
		// set some system attributes to all Persons
		if(type === 'Person') {
			if(!node['_group']) attributes.push(`s._group = "user"`) // default user group for all persons
			if(!node['_access']) attributes.push(`s._access = "user"`) // default access for all persons
		}
		// _active
		attributes.push(`s._active = true`)
		// merge only if there is ID for node
		if('id' in node[type]) {
			var insert = `MERGE (s:${type} {id:"${node[type].id}"}) SET ${attributes.join(',')} RETURN s`
			try {
				var response = await web.cypher(URL, insert)
				console.log(response)
				this.docIndex.add({id: response.result[0]['@rid'],label:node.label})
				return response.data

			} catch (e) {
				try {
					await web.createVertexType(URL, type)
					var response = await web.cypher(URL, insert)
					console.log(response)
					this.docIndex.add({id: response.result[0]['@rid'],label:node.label})
					return response.data
				} catch(e) {
					console.log(e)
					throw('Merge failed!')
				}

			}
		} else {

		}

	}


	// data = {from:[RID] ,relation: '', to: [RID]}
	async connect(from, relation, to) {
		var relation_type = ''
		var attributes = ''
		if(!from.match(/^#/)) from = '#' + from
		if(!to.match(/^#/)) to = '#' + to
		//relation = this.checkRelationData(relation)
		console.log(relation)
		if(typeof relation == 'object') {
			relation_type = relation.type
			if(relation.attributes)
				attributes = this.createAttributeCypher(relation.attributes)
		} else if (typeof relation == 'string') {
			relation_type = relation
		}
		var query = `MATCH (from), (to) WHERE id(from) = "${from}" AND id(to) = "${to}" CREATE (from)-[:${relation_type} ${attributes}]->(to) RETURN from, to`
		return web.cypher(URL, query)
	}

	async unconnect(data) {
		if(!data.from.match(/^#/)) data.from = '#' + data.from
		if(!data.to.match(/^#/)) data.to = '#' + data.to
		var query = `MATCH (from)-[r:${data.rel_type}]->(to) WHERE id(from) = "${data.from}" AND id(to) = "${data.to}" DELETE r RETURN from`
		return web.cypher(URL, query)
	}

	async deleteEdge(rid) {
		if(!rid.match(/^#/)) rid = '#' + rid
		var query = `MATCH (from)-[r]->(to) WHERE id(r) = '${rid}' DELETE r`
		return web.cypher(URL, query)
	}

	async setEdgeAttribute(rid, data) {
		if(!rid.match(/^#/)) rid = '#' + rid
		var query = `MATCH (from)-[r]->(to) WHERE id(r) = '${rid}' SET r.${data.name} = '${data.value.replace(/'/g,"\\'")}'`
		// boolean
		if(typeof data.value == 'boolean' || typeof data.value == 'number') query = `MATCH (from)-[r]->(to) WHERE id(r) = '${rid}' SET r.${data.name} = ${data.value}`
		// integer
		if(Array.isArray(data.value)) {
			if(data.value.length > 0) {
				data.value = data.value.map(i => `'${i}'`).join(',')
				query = `MATCH (from)-[r]->(to) WHERE id(r) = '${rid}' SET r.${data.name} = [${data.value}]`
			} else {
				query = `MATCH (from)-[r]->(to) WHERE id(r) = '${rid}' SET r.${data.name} = []`
			}
		}

		//if(!data.value) query = `MATCH (from)-[r]->(to) WHERE id(r) = '${rid}' REMOVE r.${data.name}`
		return web.cypher(URL, query)
	}

	async setNodeAttribute(rid, data) {
		if(!rid.match(/^#/)) rid = '#' + rid
		var query = `MATCH (node) WHERE id(node) = '${rid}' SET node.${data.key} = '${data.value.replace(/'/g,"\\'")}'`
		console.log(query)
		if(typeof data.value == 'boolean') query = `MATCH (node) WHERE id(node) = '${rid}' SET node.${data.key} = ${data.value}`

		if(Array.isArray(data.value) && data.value.length > 0) {
			data.value = data.value.map(i => `'${i}'`).join(',')
			query = `MATCH (node) WHERE id(node) = '${rid}' SET node.${data.key} = [${data.value}]`
		}

		return web.cypher(URL, query)
	}

	async getNodeAttributes(rid) {
		if(!rid.match(/^#/)) rid = '#' + rid
		var query = `MATCH (node) WHERE id(node) = '${rid}' RETURN node`
		return web.cypher(URL, query)
	}

	async getGraph(body, ctx) {

		var me = await this.myId(ctx.request.headers.mail)
		// ME
		if(body.query.includes('_ME_')) {
			body.query = body.query.replace('_ME_', me.rid)
		}

		var schema_relations = null
		// get schemas first so that one can map relations to labels
		if(!body.raw) {
			schema_relations = await this.getSchemaRelations()
		}
		const options = {
			serializer: 'graph',
			format: 'cytoscape',
			schemas: schema_relations,
			current: body.current,
			me: me
		}

		return web.cypher(URL, body.query, options)
	}

	async getSchemaRelations() {
		var schema_relations = {}
		var schemas = await web.cypher(URL, 'MATCH (s:Schema)-[r]->(s2:Schema) return type(r) as type, r.label as label, r.label_rev as label_rev, COALESCE(r.label_inactive, r.label) as label_inactive, s._type as from, s2._type as to, r.tags as tags, r.compound as compound')
		schemas.result.forEach(x => {
			schema_relations[x.type] = x
		})
		return schema_relations
	}

	async getSearchData(search) {
		if(search[0]) {
			var arr = search[0].result.map(x => '"' + x + '"')
			var query = `MATCH (n) WHERE id(n) in [${arr.join(',')}] AND NOT n:Schema return id(n) as id, n.label as label, labels(n) as type LIMIT 10`
			return web.cypher(URL, query)
		} else {
			return {result:[]}
		}
	}

	checkRelationData(data) {
		if(data.from) {
			if(!data.from.match(/^#/)) data.from = '#' + data.from
		}
		if(data.to) {
			if(!data.to.match(/^#/)) data.to = '#' + data.to
		}
		if(data.relation_id) {
			if(!data.relation_id.match(/^#/)) data.relation_id = '#' + data.relation_id
		}
		return data
	}



	createAttributeCypher(attributes) {
		var attrs = []
		var cypher = ''
		for (var key in attributes) {
			if(Array.isArray(attributes[key])) {
				if(attributes[key].length > 0) {
					var values_str = attributes[key].map(i => `'${i}'`).join(',')
					attrs.push(`${key}:[${values_str}]`)
				} else {
					attrs.push(`${key}:[]`)
				}
			} else {
				attrs.push(`${key}: "${attributes[key]}"`)
			}
		}
		return '{' + attrs.join(',') + '}'
	}





	async checkMe(user) {
		if(!user) throw('user not defined')
		var query = `MATCH (me:Person {id:"${user}"}) return id(me) as rid, me._group as group, me._access as access`
		var result = await web.cypher(URL, query)
		// add user if not found
		if(result.result.length == 0) {
			query = `MERGE (p:Person {id: "${user}"}) SET p.label = "${user}", p._group = 'user', p._active = true`
			result = await web.cypher(URL, query)
			query = `MATCH (me:Person {id:"${user}"}) return id(me) as rid, me._group as group`
			result = await web.cypher(URL, query)
			return result.result[0]
		} else return result.result[0]
	}

	async myId(user) {
		if(!user) throw('user not defined')
		var query = `MATCH (me:Person {id:"${user}"}) return id(me) as rid, me._group as group, me._access as access`
		var response = await web.cypher(URL, query)
		return response.result[0]
	}

	async getGroups() {
		var query = 'MATCH (x:UserGroup) RETURN x.label as label, x.id as id'
		var result = await web.cypher(URL, query)
		return result.result
	}

	async getMaps() {
		var query = 'MATCH (t:QueryMap) RETURN t order by t.label'
		var result = await web.cypher(URL, query)
		return result.result
	}

	async getMenus(group) {
		//var query = 'MATCH (m:Menu) return m'
		var query = `MATCH (m:Menu) -[:VISIBLE_FOR_GROUP]->(n:UserGroup {id:"${group}"}) OPTIONAL MATCH (m)-[]-(q) WHERE q:Query OR q:Tag RETURN COLLECT( q) AS items, m.label as label, m.id as id ORDER BY id`
		var result = await web.cypher(URL, query)
		var menus = this.forceArray(result.result, 'items')
		return menus
	}

	forceArray(data, property) {
		for(var row of data) {
			if(!Array.isArray(row[property])) {
				row[property] = [row[property]]
			}
		}
		return data

	}

	// data = {rel_types:[], node_types: []}
	async myGraph(user, data) {
		if(!data.return) data.return = 'p,r,n, n2'
		var rel_types = []; var node_types = []
		var node_query = ''
		if(!user || !Array.isArray(data.rel_types) || !Array.isArray(data.node_types)) throw('invalid query!')

		// by default get all relations and all nodes linked to 'user'
		for(var type of data.rel_types) {
			rel_types.push(`:${type.trim()}`)
		}
		for(var node of data.node_types) {
			node_types.push(`n:${node.trim()}`)
		}
		if(node_types.length) node_query = ` WHERE ${node_types.join (' OR ')}`
		var query = `MATCH (p:Person {id:"${user}"})-[r${rel_types.join('|')}]-(n) OPTIONAL MATCH (n)--(n2) ${node_query} return ${data.return}`

		return web.cypher(URL, query, 'graph')
	}


	// get list of documents WITHOUT certain relation
	// NOTE: open cypher bundled with Arcadedb did not work with "MATCH NOT (n)-[]-()"" -format. This could be done with other query language.
	async getListByType(query_params) {
		var query = `MATCH (n) return n.label as text, id(n) as value ORDER by text`
		if(query_params.type) query = `MATCH (n:${query_params.type}) return n.label as text, id(n) as value ORDER by text`
		var all = await web.cypher(URL, query)
		if(query_params.relation && query_params.target) {
			query = `MATCH (n:${query_params.type})-[r:${query_params.relation}]-(t) WHERE id(t) = "#${query_params.target}" return COLLECT(id(n)) as ids`
			var linked = await web.cypher(URL, query)
			//console.log(linked.result)
			//console.log(all.result)
			var r = all.result.filter(item => !linked.result[0].ids.includes(item.value));
			//console.log(r)
			return r

		} else {
			return all
		}

	}


	async importGraphYAML(filename, mode) {
		console.log(`** importing graph ${filename} **`)
		try {
			const file_path = path.resolve('./graph', filename)
			const data = await fsPromises.readFile(file_path, 'utf8')
			const graph_data = yaml.load(data)
			if(mode == 'clear') {
				var query = 'MATCH (s) WHERE NOT s:Schema DETACH DELETE s'
				var result = await web.cypher(URL, query)
				await this.setSystemNodes()
				await this.createSystemGraph()
				await this.writeGraphToDB(graph_data)
			} else {
				// otherwise we merge
				await this.mergeGraphToDB(graph_data)
			}
			this.createIndex()
			// const filePath = path.resolve('./schemas', filename)
			// const data = await fsPromises.readFile(filePath, 'utf8')
			// const schema = yaml.load(data)
			// await this.writeSchemaToDB(schema)
		} catch (e) {
			throw(e)
		}
		console.log('Done import')
	}


	async mergeGraphToDB(graph) {
		try {
			for(var node of graph.nodes) {
				console.log(node)
				const type = Object.keys(node)[0]
				await this.merge(type, node)

			}
		} catch (e) {
			throw(e)
		}
	}

	async writeGraphToDB(graph) {
		try {
			for(var node of graph.nodes) {
				const type = Object.keys(node)[0]
				var attributes = []
				for(var key of Object.keys(node[type])) {
					if(key === '_active') attributes.push(`s.${key} = ${JSON.parse(node[type][key])}`)
					else attributes.push(`s.${key} = "${node[type][key]}"`)
				}
				if(!('_active' in node[type])) attributes.push(`s._active = true`)

				var insert = `CREATE (s:${type}) SET ${attributes.join(',')}`
				console.log(insert)
				var reponse = await web.cypher(URL, insert)
			}

			for(var edge of graph.edges) {
				const edge_key = Object.keys(edge)[0]
				const splitted = edge_key.split('>')
				if(splitted.length == 3) {
					const from = splitted[0].split(':')
					const to = splitted[2].split(':')
					const from_type = from[0]
					const from_id = from[1]
					const to_type = to[0]
					const to_id = to[1]
					console.log('from:' + from_type)
					console.log('id:' + from_id)
					console.log('to:' + to_type)
					console.log('id:' + to_id)

					var attributes = []
					var attr_str = ''
					if(edge[edge_key]) {
						for(var key of Object.keys(edge[edge_key])) {
							attributes.push(`r.${key} = "${edge[edge_key][key]}"`)
						}
						console.log(attributes)
						if(attributes.length) attr_str = 'SET ' + attributes.join(',')
					}

					var link_query = `MATCH (from:${from_type} {id: "${from_id}"}), (to: ${to_type} {id:"${to_id}"}) MERGE (from)-[r:${splitted[1]}]->(to) ${attr_str}`
					var response = await web.cypher(URL, link_query)
				} else {
					throw('Graph edge error: ' + Object.keys(edge)[0])
				}

			}
			// 	var edge_parts = type.split(':')
			// 	var link_query = `MATCH (from:Schema {_type: "${edge_parts[0]}"}), (to: Schema {_type:"${edge_parts[2]}"}) MERGE (from)-[r:${edge_parts[1]}]->(to) SET r.label ="${edge[type].label}", r.label_rev = "${edge[type].label_rev}"`
			// 	var reponse = await web.cypher(URL, link_query)
			// }
		} catch (e) {
			throw(e)
		}
	}



	async mergeFIX(type, schema_type) {
		const c_query = `MATCH (n:${type}) return count(n) as count`
		var count = await web.cypher(URL, c_query)
		if(count.result[0].count === 0) {
			var query = `CREATE (c:${type})
				set c._type = "${schema_type}"`
			await web.cypher(URL, query)
		}
	}

	async getTags() {
		var query = 'MATCH (t:Tag) RETURN t order by t.label'
		return await web.cypher(URL, query)
	}

	async getQueries() {
		var query = 'MATCH (t:Query)  RETURN t'
		return await web.cypher(URL, query)
	}

	async getStyles() {
		var query = 'MATCH (s:Schema) return COALESCE(s._style,"") as style, s._type as type'
		return await web.cypher(URL, query)
	}

	async getFileList(dir) {
		if(['graph', 'styles', 'schemas'].includes(dir)) {
			var files = await fsPromises.readdir(dir)
			console.log(files)
			return files
		} else {
			throw('Illegal path')
		}
	}

	async setLayout(body, me) {
		if(!body.target || !body.data) throw('data missing')
		if(!body.target.match(/^#/)) body.target = '#' + body.target
		var for_cypher = {}
		for(var id in body.data) {
			var id_clean = id.replace('#', 'node').replace(':','_')
			for_cypher[id_clean] = body.data[id]
		}
		var as_string = JSON5.stringify(for_cypher)
		const query = `MERGE (l:Layout {user: "${me.rid}", target: "${body.target}"}) SET l.positions = ${as_string} RETURN l`
		return await web.cypher(URL, query)
	}

	async getLayoutByTarget(rid, me) {
		if(!rid.match(/^#/)) rid = '#' + rid
		var query = `MATCH (l:Layout) WHERE l.target = "${rid}" AND l.user = "${me.rid}" return l`
		const result =  await web.cypher(URL, query)
		if(result.result.length)
			return result.result[0]
		else
			return []

	}

	async getStats() {
		const query = 'MATCH (n) RETURN DISTINCT LABELS(n) as labels, COUNT(n) as count  ORDER by count DESC'
		const result =  await web.cypher(URL, query)
		return result
	}

	async getDataWithSchema(rid, by_groups) {
		by_groups = 1

		if(!rid.match(/^#/)) rid = '#' + rid
		var data = await web.cypher(URL, `MATCH (source) WHERE id(source) = "${rid}" OPTIONAL MATCH (source)-[rel]-(target)  return source, rel, target ORDER by target.label`)
		if(data.result.length == 0) return []


		var type = data.result[0].source['@type']
		data.result[0].source = await schema.getSchemaAttributes(type, data.result[0].source)
		//var att = await this.getNodeAttributes(rid)
		var schemas = await schema.getSchema(type)

		for(var schema_item of schemas) {
			schema_item.data = data.result.filter(ele => ele.rel['@type'] == schema_item.type).map(ele => {
				var out = {}
				var rel_active = ele.rel._active
				if(typeof ele.rel._active === 'undefined') rel_active = true
				if(!ele.target._active) rel_active = false
				if(ele.rel['@out'] == ele.source['@rid'])
					out=  {
						id: ele.target['@rid'],
						type: ele.target['@type'],
						label: ele.target['label'],
						rel_id: ele.rel['@rid'],
						rel_active: rel_active
					}
				else {
					out =  {
						id: ele.target['@rid'],
						type: ele.target['@type'],
						label: ele.target['label'],
						rel_id: ele.rel['@rid'],
						rel_active: rel_active
					}
				}
				if(ele.rel['attr']) out.rel_attr = ele.rel['attr']
				if(ele.rel['x']) out.rel_x = ele.rel['x']
				if(ele.rel['y']) out.rel_y = ele.rel['y']
				return out
			})
		}

		if(by_groups) {
			const tags = await this.getTags()
			var out = {
				_attributes: data.result[0].source,
				tags: {
					default_display: {
						relations:[],
						label:'default',
						count: 0
					},
				}
			}
			var default_group = []
			for(var relation of schemas) {
				if(relation.display && relation.display == 'default') {
					out.tags.default_display.relations.push(relation)
					out.tags.default_display.count = out.tags.default_display.count + relation.data.length
				} else if(relation.tags) {
					if (Array.isArray(relation.tags) && relation.tags.length > 0) {
						var tag = tags.result.find(x => relation.tags.includes(x.id))
					} else if (typeof relation.tags == 'string') {
						var tag = tags.result.find(x => relation.tags == x.id)
					}
					if(tag) {
						var tag_label = tag.label ? tag.label : tag.id
						if(!out.tags[relation.tags]) {
							out.tags[relation.tags] = {relations: [], label: tag_label, count: 0}
						}
						out.tags[relation.tags].relations.push(relation)
						out.tags[relation.tags].count = out.tags[relation.tags].count + relation.data.length
					// if tag was found but empty, then push to default group
					} else {
						default_group.push(relation)
					}

					// if no tag found, then push to default group
				} else {
					default_group.push(relation)
				}

			}
			out.tags.default_group = {relations:default_group, label:'Relations'}
			return out
		} else {
			return schemas
		}


	}
}
