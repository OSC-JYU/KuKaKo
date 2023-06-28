
const username = 'root'
const password = process.env.DB_PASSWORD

const MAX_STR_LENGTH = 2048
const DB_HOST = process.env.DB_HOST || 'http://localhost'
const DB = process.env.DB_NAME || 'kukako'
const PORT = process.env.DB_PORT || 2480
const URL = `${DB_HOST}:${PORT}/api/v1/command/${DB}`

let web = {}

web.getURL = function() {
	return URL
}

web.createDB = async function() {
	const { default: got } = await import('got');
	var url = URL.replace(`/command/${DB}`, '/server')
	var data = {
		username: username,
		password: password,
		json: {
			command: `create database ${DB}`
		}
	};
console.log(url)
console.log(data)
console.log(process.env.DB_HOST)
	try {
		await got.post(url, data)
	} catch(e) {
		console.log(e.message)
		throw({message: "Database creation failed"})
	}
}

web.createVertexType = async function(type) {
	var query = `CREATE vertex type ${type}`
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
	var response = await got.post(URL, data).json()
	return response
}

web.cypher = async function(query, options, no_console) {

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
	if(!no_console) console.log(query)

	try {
		var response = await got.post(URL, data).json()
		if(query && query.toLowerCase().includes('create')) return response
		else if(!options.serializer) return response
		else if(options.serializer == 'graph' && options.format == 'cytoscape') {
			options.labels = await getSchemaLabels(data)
			return convert2CytoScapeJs(response, options)
		} else {
			return response
		}
	} catch(e) {
		console.log(e.message)
		throw({message: e.message})
	}
}

async function getSchemaLabels(data) {

	const { default: got } = await import('got');

	const query = "MATCH (s:Schema)  RETURN COALESCE(s.label, s._type)  as label, s._type as type"
	data.json = {
		command:query,
		language:'cypher'
	}
	try {
		var response = await got.post(URL, data).json()
		var labels = response.result.reduce(
			(obj, item) => Object.assign(obj, { [item.type]: item.label }), {});
		return labels
	} catch(e) {
		console.log(e.response)
		console.log(query)
		throw(e)
	}
}

function setParent(vertices, child, parent) {
	for(var node of vertices) {
		if(node.data.id == child) {
			node.data.parent = parent
		}
	}
}

// not really clustering, more like auto-compound
function cluster(nodes, edges) {
	var unique_links = {}
	var cluster_types = {}
	var cluster_nodes = []
	var cluster_edges = []

	var clustered_links = []
	var clustered_edges = []
	var clustered_nodes = []

	clustered_nodes = nodes


	for(var edge of edges) {
		var cluster_id = edge.data.source + '__' + edge.data.type
		if(unique_links[cluster_id]) {
			unique_links[cluster_id].push(edge.data.target)
		} else {
			unique_links[cluster_id] = [edge.data.target]
		}
	}

	for(var cluster_id in unique_links) {
		if(unique_links[cluster_id].length > 10) {
			var splitted = cluster_id.split('__')
			var source = splitted[0]
			var rel = splitted[1]
			clustered_links.push(cluster_id)

			cluster_nodes.push({data: {name: cluster_id, type_label: 'Cluster', id: cluster_id, type:'Cluster', width:100, active:true}})
			cluster_edges.push({data: {label: rel, source: source, target: cluster_id, active: true}})
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

	// add parent to Cluster node to all clustered notes
	clustered_nodes = nodes.filter(node => {
		for(var cluster_id of clustered_links) {
			var splitted = cluster_id.split('__')
			var source = splitted[0]
			var rel = splitted[1]
			if(unique_links[cluster_id].includes(node.data.id)) {
				console.log(cluster_id)
				node.data.parent = cluster_id
			}
		}
		return node
	})

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
							idc: v.r.replace(':','_')
						}
					}
				} else {
					node = {
						data:{
							id:v.r,
							name:v.p.label,
							type: v.t,
							type_label: options.labels[v.t],
							active: v.p._active,
							width: 100,
							idc: v.r.replace(':','_')
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

				// add relationship labels to graph from schema
				if(options.schemas) {
					if(options.schemas[v.t]) {
						if(options.schemas[edge.data.label].label) {
							if(edge.data.active) {
								edge.data.label = options.schemas[edge.data.label].label.toUpperCase()
							} else {
								edge.data.label = options.schemas[edge.data.label].label_inactive
							}
						} else {
							edge.data.label = edge.data.label
						}
						if(options.schemas[v.t].compound === true) {
							console.log('***************** COMPoUND ***************\n\n')
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
	if(options.current) {
		//return {nodes:nodes, edges: edges}
		var clustered = cluster(nodes, edges)
		return {nodes:clustered.nodes, edges: clustered.edges}
	} else {
		return {nodes:nodes, edges: edges}
	}
}


module.exports = web
