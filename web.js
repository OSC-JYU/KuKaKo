
const username = process.env.DB_USERNAME || 'root'
const password = process.env.DB_PASSWORD

const MAX_STR_LENGTH = 2048
const DB_HOST = process.env.DB_HOST || 'http://localhost'
const DB = process.env.DB_NAME || 'kukako'
const PORT = process.env.DB_PORT || 2480
const DB_URL = `${DB_HOST}:${PORT}/api/v1/command/${DB}`
const GROUP_THRESHOLD = process.env.GROUP_THRESHOLD || 1

let web = {}

web.getURL = function() {
	return DB_URL
}


web.checkDB = async function() {
	const { default: got } = await import('got');
	var url = DB_URL.replace(`/command/`, '/exists/')
	var data = {
		username: username,
		password: password
	};
	try {
		var response = await got.get(url, data).json()
		return response.result
		
		
	} catch(e) {
		console.log(e.message)
		throw({message: "Error on database check", code: e.code})
	}
}


web.createDB = async function() {
	const { default: got } = await import('got');
	var url = DB_URL.replace(`/command/${DB}`, '/server')
	var data = {
		username: username,
		password: password,
		json: {
			command: `create database ${DB}`
		}
	};

	try {
		await got.post(url, data)
	} catch(e) {
		console.log(e.message)
		throw({message: "Database creation failed"})
	}
}

web.createVertexType = async function(type) {
	var query = `CREATE VERTEX TYPE ${type} IF NOT EXISTS`
	console.log(query)
	try {
		await this.sql(query)
	} catch (e) {
		console.log(e.message)
	}
}

web.createEdgeType = async function(type) {
	var query = `CREATE EDGE TYPE ${type} IF NOT EXISTS`
	console.log(query)
	try {
		await this.sql(query)
	} catch (e) {
		console.log(e.message)
		//console.log(`${type} exists`)
	}
}

web.sql = async function(query, options) {

	const { default: got } = await import('got');

	var data = {
		username: username,
		password: password,
		json: {
			command:query,
			language:'sql'
		}
	};
	var response = await got.post(DB_URL, data).json()
	return response
}


web.getGraph = async function(query, options, debug) {

	const { default: got } = await import('got');
	if(!options) var options = {}
	
	var data = {
		username: username,
		password: password,
		json: {
			command:query,
			language:'cypher',
			serializer: 'graph'
		}
	};
	
	try {
		var response = await got.post(DB_URL, data).json()
		options.schemas = await getSchemaRelations(data)
		options.labels = await getSchemaVertexLabels(data)
		console.log(options)
		console.log(response)
		return convert2CytoScapeJs(response, options)
	} catch(e) {
		throw({message: e.message, code: e.code})
	}
}


web.cypher = async function(query, options, debug) {

	const { default: got } = await import('got');

	if(!options) var options = {}
	if(options.current && !options.current.includes('#')) options.current = '#' + options.current

	var data = {
		username: username,
		password: password,
		json: {
			command:query,
			language:'cypher'
		}
	};

	if(options.serializer) data.json.serializer = options.serializer
	if(debug) console.log(query)

	try {
		var response = await got.post(DB_URL, data).json()
		if(query && query.toLowerCase().includes('create')) return response
		else if(!options.serializer) return response
		else if(options.serializer == 'graph' && options.format == 'cytoscape') {
			options.labels = await getSchemaVertexLabels(data)
			return convert2CytoScapeJs(response, options)
		} else {
			return response
		}
	} catch(e) {
		console.log(e)
		throw({message: e.message, code: e.code})
	}
}

async function getSchemaVertexLabels(data) {

	const { default: got } = await import('got');

	const query = "MATCH (s:Nodes)  RETURN COALESCE(s.label, s._type)  as label, s._type as type"
	data.json = {
		command:query,
		language:'cypher'
	}
	try {
		var response = await got.post(DB_URL, data).json()
		var labels = response.result.reduce(
			(obj, item) => Object.assign(obj, { [item.type]: item.label }), {});
		return labels
	} catch(e) {
		console.log(e.response)
		console.log(query)
		throw(e)
	}
}

async function getSchemaRelations(data) {
	const { default: got } = await import('got');
	const query = 'MATCH (s:Nodes)-[r]->(s2:Nodes) return type(r) as type, r.label as label, r.label_rev as label_rev, COALESCE(r.label_inactive, r.label) as label_inactive, s._type as from, s2._type as to, r.tags as tags, r.compound as compound'
	data.json = {
		command:query,
		language:'cypher'
	}
	var schema_relations = {}
	var schemas = await got.post(DB_URL, data).json()
	schemas.result.forEach(x => {
		schema_relations[`${x.from}:${x.type}:${x.to}`] = x
	})
	return schema_relations
}

function setParent(vertices, child, parent) {
	for(var node of vertices) {
		if(node.data.id == child) {
			node.data.parent = parent
		}
	}
}

// group relations by their type if count > grouping threshold 
// this groups relations only for one "central node" (homepage of person)
function nodeGrouping(nodes, edges, vertex_types, options) {
	var unique_links = {}
	var cluster_types = {}
	var cluster_nodes = []
	var cluster_edges = []

	var clustered_links = []
	var clustered_edges = []
	var clustered_nodes = []

	clustered_nodes = nodes


	for(var edge of edges) {
		// currently cluster only if source is Person TODO: remove this constraint!
		if(vertex_types[options.current] == 'Person') {
			var cluster_id = edge.data.source + '__' + edge.data.type + '__' + vertex_types[edge.data.target]
			if(unique_links[cluster_id]) {
				unique_links[cluster_id].push(edge.data.target)
			} else {
				unique_links[cluster_id] = [edge.data.target]
			}
		}

	}


	for(var cluster_id in unique_links) {
		if(unique_links[cluster_id].length > GROUP_THRESHOLD) {
			var splitted = cluster_id.split('__')
			var source = splitted[0]
			var rel = splitted[1]
			var target = splitted[2]
			clustered_links.push(cluster_id)

			var schema_id = `Person:${rel}:${target}`
			var cluster_label = rel
			if(options.schemas[schema_id]) {
				cluster_label = options.schemas[schema_id].label
			}
			
			// add cluster node
			cluster_nodes.push({data: {name: cluster_label, type_label: 'Cluster', id: cluster_id, type:'Cluster', width:100, active:true}})

			// add link from "central node" to cluster node
			cluster_edges.push({data: {label: '', source: source, target: cluster_id, active: true}})
		}
	}

	clustered_edges = edges.filter(edge => {
		// filter out clustered links
		var found = false
		for(var cluster_id of clustered_links) {
			var splitted = cluster_id.split('__')
			var source = splitted[0]
			var rel = splitted[1]
			if(edge.data.source == source) {
				if(unique_links[cluster_id].includes(edge.data.target) && edge.data.type === rel)
					found = true
			}
		}
		if(!found) return edge
	})

	var multiples = []

	// set .parent to Cluster node to all clustered notes
	clustered_nodes = nodes.filter(node => {
		var count = 0
		for(var cluster_id of clustered_links) {
			if(unique_links[cluster_id].includes(node.data.id)) {
				// create copies of nodes that are on multiple clusters
				if(node.data.parent) {
					const clone = JSON.parse(JSON.stringify(node))
					clone.data.id = clone.data.id + '_' + count
					clone.data.parent = cluster_id
					multiples.push(clone)
					count++
				} else {
					node.data.parent = cluster_id
				}
			}
		}
		return node
	})

	clustered_nodes = clustered_nodes.concat(multiples)

	// add cluster nodes and edges to output
	clustered_nodes = clustered_nodes.concat(cluster_nodes)
	clustered_edges = clustered_edges.concat(cluster_edges)

	if(clustered_links.length === 0) {
		clustered_nodes = nodes
		clustered_edges = edges
	}


	// console.log('Edges to be clustered:')
	// console.log(clustered_links)
	// console.log('clustered edge count: ' + edges.length)
	// console.log(cluster_nodes)
	return {edges: clustered_edges, nodes: clustered_nodes}

}


function convert2CytoScapeJs(data, options) {

	if(!options) var options = {labels:{}}
	var vertex_ids = []
	var nodes = []
	var inactive_nodes = []
	var vertex_types = {}

	if(data.result.vertices) {
		for(var v of data.result.vertices) {
			if(!vertex_ids.includes(v.r)) {
				var node = {}
				if(v.p._type) { // schema
					node = {
						data:{
							id:v.r,
							name:options.labels[v.p._type],
							type: v.p._type,
							type_label: v.p._type,
							active: true,
							width: 100,
							idc: v.r.replace('#','')
						}
					}
				} else {
					vertex_types[v.r] = v.t
					node = {
						data:{
							id:v.r,
							name:v.p.label,
							type: v.t,
							type_label: options.labels[v.t],
							active: v.p._active,
							width: 100,
							idc: v.r.replace('#','')
						 }
					}
					if(!node.data.active) inactive_nodes.push(v.r)
				}

				if(v.r == options.current) node.data.current = 'yes'
				if(options.me && v.r == options.me.rid ) node.data.me = 'yes'
				if(v.p._image) node.data.image = v.p._image
				nodes.push(node)
				vertex_ids.push(v.r)
				//console.log(node)
			}
		}
	}

	var edges = []
	var ids = []
	if(data.result.edges) {
		for(var v of data.result.edges) {
			if(!ids.includes(v.r)) {
				var edge = {data:{id:v.r, source:v.o, target:v.i, label:v.t, type:v.t, active:v.p._active}}
				ids.push(v.r)
				if(typeof v.p._active == 'undefined') edge.data.active = true
				else edge.data.active = v.p._active
				// links to inactive node are also inactive
				if(inactive_nodes.includes(edge.data.source) || inactive_nodes.includes(edge.data.target))
					edge.data.active = false

				// add relationship labels to graph from schema relations
				if(options.schemas) {
					var edge_id = `${vertex_types[edge.data.source]}:${v.t}:${vertex_types[edge.data.target]}`

					if(options.schemas[edge_id]) {
						if(options.schemas[edge_id].label) {
							if(edge.data.active) {
								edge.data.label = options.schemas[edge_id].label.toUpperCase()
							} else {
								edge.data.label = options.schemas[edge_id].label_inactive
							}
						} else {
							edge.data.label = edge.data.label
						}

						if(options.schemas[edge_id].compound === true) {
							if(options.current == v.o)
								edges.push(edge)
							else
								setParent(nodes, v.o, v.i)
						} else {
							edges.push(edge)
						}

					} else {
						edges.push(edge)
					}
				} else {
					edges.push(edge)
				}

			}
		}
	}

	// group only if we are on homepage
	if(options.current) {
		var grouped = nodeGrouping(nodes, edges, vertex_types, options)
		return {nodes:grouped.nodes, edges: grouped.edges}
	} else {
		return {nodes:nodes, edges: edges}
	}
}


module.exports = web
