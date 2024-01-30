const path = require('path')
const JSON5 = require('json5')
const yaml = require('js-yaml')
const fsPromises = require('fs/promises')

const schema = require("./schema.js")
const web = require("./web.js")

const timers = require('timers-promises')

// some layouts are same for all users
const COMMON_LAYOUTS = ['schema', 'navigation', 'about']
const MAX_STR_LENGTH = 2048
const MATCH_BY_ID = true

// Assigning to exports will not modify module, must use module.exports
module.exports = class Graph {

	async initDB(docIndex) {
		console.log(`ArcadeDB: ${web.getURL()}`)
		console.log(`Checking database...`)
		this.docIndex = docIndex
		const query = 'MATCH (n:Schema) return n'

		try {
			await web.cypher(query)
		} catch (e) {
			try {
				if(e.code == 'ERR_GOT_REQUEST_ERROR') {
					console.log('Request error! Check database. Did you set DB_PASSWORD? exiting...')
					process.exit(1)					
				}

				if(e.code == 'ECONNREFUSED') {
					console.log('database not ready, waiting 10 seconds...')
					await timers.setTimeout(10000)
				}
				console.log('Checking database...')
				var result = await web.cypher(query)
			} catch (e) {
				if(e.code == 'ECONNREFUSED') {
					console.log(`ERROR: Database connection refused! \nIs Arcadedb running at ${web.getURL()}?`)
					console.log('exiting...')
					process.exit(1)
				} else {
					console.log(`Database not found! \nTrying to create in 10 secs...`)
					await timers.setTimeout(10000)
					try {
						await web.createDB()
					} catch (e) {
						console.log(`Could not init database. \nIs Arcadedb running at ${web.getURL()}?`)
						console.log('exiting...')
						process.exit(1)
					}
				}
			}
		}
		await this.setSystemNodes()
	}


	async setSystemNodes() {
		try {
			// database exist, make sure that some base types are present
			await web.createVertexType('Schema')
			await web.createVertexType('Person')
			await web.createVertexType('UserGroup')
			await web.createVertexType('Menu')
			await web.createVertexType('Query')
			await web.createVertexType('Tag')
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

			// Usergroup "Basic"
			var query = 'MERGE (m:UserGroup {id:"user"}) SET m.label = "User", m._active = true RETURN m'
			var group = await web.cypher(query)

			// Menu "Me"
			// var query = 'MERGE (m:Menu {id:"me"}) SET m.label = "Me", m._active = true RETURN m'
			// var menu = await web.cypher(query)


			// Make sure that "Me" menu is linked to the "User" group
			// query = `MATCH (m:Menu), (g:UserGroup) WHERE id(m) = "${menu.result[0]['@rid']}" AND id(g) = "${group.result[0]['@rid']}" MERGE (m)-[:VISIBLE_FOR_GROUP]->(g)`
			// await web.cypher(query)

			// default local user
			query = `MERGE (p:Person {id:"local.user@localhost"}) SET p._group = "user", p._access = "admin", p._active = true, p.label = "Local You", p.description = "It's really You!" RETURN p`
			await web.cypher(query)
		} catch (e) {
			console.log(query)
			throw('System graph creation failed')
		}
	}


	async createIndex() {
		console.log('Starting to index with flexsearch ...')
		var query = 'MATCH (n) return id(n) as id, n.label as label, n.description as description'
		try {
			var result = await web.cypher( query)
			try {
				for (var node of result.result) {
					await this.docIndex.add(node)
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
		return web.cypher( body.query)
	}

	async hasAdminPermissions(auth_header) {
		var me = await this.myId(auth_header)
		if(me.access === 'admin') {
			return true
		}
		return false
	}

	async hasCreatePermissions(type_data, auth_header) {
		var me = await this.myId(auth_header)
		if(me.access === 'admin') {
			return true
		} else if(me.access === 'creator' && type_data.label !== 'Schema') {
			return true
		} else if(me.access === 'user' && type_data._public) {
			return true
		}
		return false
	}


	async hasDeletePermissions(auth_header) {
		var me = await this.myId(auth_header)
		if(me.access === 'admin') {
			return true
		} else return false
	}


	async hasConnectPermissions(from, to, auth_header) {
		var me = await this.myId(auth_header)
		from = this.checkHastag(from)
		to = this.checkHastag(to)

		// one can join oneself
		if(me.rid === from || me.rid === to)
			return true
		if(me.access === 'creator' || me.access === 'admin') {
			return true
		} 
		// TODO: this must check that Schema can be connected only by admin
		return false
	}

	async hasNodeAttributePermissions(node_rid, auth_header) {
		var me = await this.myId(auth_header)
		node_rid = this.checkHastag(node_rid)

		// one can set one's own attributes
		if(me.rid === node_rid)
			return true
		if(me.access === 'admin') {
			return true
		} 
		return false
	}


	async hasEdgeAttributePermissions(from, to, auth_header) {
		var me = await this.myId(auth_header)
		from = this.checkHastag(from)
		to = this.checkHastag(to)

		if(me.rid === from || me.rid === to)
			return true
		if(me.access === 'creator' || me.access === 'admin') {
			return true
		} 
		return false
	}



	async create(type, data, auth_header) {
		try {
			console.log(data)
			let type_attributes = {}
			if(type === 'Schema') {
				type_attributes.label = 'Schema'
			} else {
				type_attributes = await schema.getSchemaType(type, 1)
			}
			
			console.log(type_attributes)
			const privileged = await this.hasCreatePermissions(type_attributes, auth_header)
			if(!privileged) {
				throw(`no rights to add "${type}"`)
			}
	
			var data_str_arr = []
			// expression data to string
			for(var key in data) {
				if(data[key]) {
					if(Array.isArray(data[key]) && data[key].length > 0) {
						if(!key.includes('@')) {
							data[key] = data[key].map(i => `'${i}'`).join(',')
							data_str_arr.push(`${key}:[${data[key]}]`)
						}

					} else if (typeof data[key] == 'string') {
						if(data[key].length > MAX_STR_LENGTH) throw('Too long data!')
						if(!key.includes('@')) {
							data_str_arr.push(`${key}:"${data[key].replace(/"/g, '\\"')}"`)
						}
					} else {
						data_str_arr.push(`${key}:${data[key]}`)
					}
				}
			}
			// set some system attributes to all Persons
			if(type === 'Person') {
				if(!data['_group']) data_str_arr.push(`_group: "user"`) // default user group for all persons
				if(!data['_access']) data_str_arr.push(`_access: "user"`) // default access for all persons
			}
			// _active
			if(!data['_active']) data_str_arr.push(`_active: true`)
	
			var query = `CREATE (n:${type} {${data_str_arr.join(',')}}) return n`
			console.log(query)
			return web.cypher( query) 
			
		} catch(e) {
			console.log(e)
			throw('Creation failed ' + e)
		}

	}


	async deleteNode(rid, auth_header) {
		try {
			if(await this.hasDeletePermissions(auth_header)) {
				rid = this.checkHastag(rid)
				var query = `MATCH (n) WHERE id(n) = '${rid}' RETURN labels(n) as type`
				var response = await web.cypher(query)
				if(response.result && response.result.length == 1) {
					var type = response.result[0].type
					var query_delete = `DELETE FROM ${type} WHERE @rid = "${rid}"`
					console.log(query_delete)
					return web.sql(query_delete)
				}
			}	
			return response
		} catch (e) {
			console.log(e)
			throw('Node delete failed ' + e)
		}
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
				var response = await web.cypher( insert)
				console.log(response)
				this.docIndex.add({id: response.result[0]['@rid'],label:node.label})
				return response.data

			} catch (e) {
				try {
					await web.createVertexType(type)
					var response = await web.cypher( insert)
					console.log(response)
					this.docIndex.add({id: response.result[0]['@rid'],label:node.label})
					return response.data
				} catch(e) {
					console.log(e)
					throw('Merge failed!')
				}
			}
		} 
	}



	// TODO
	async mergeConnect(edge) {
		
		// NOTE: we cannnot use Cypher's merge, since it includes attributes in comparision
		// TODO: Currently we do not update attributes for existing links
		if(edge.from && edge.to && edge.relation) {
			
			try {
				const query = `MATCH (from)-[:${edge.relation}]->(to) WHERE from.id = "${edge.from}" AND to.id = "${edge.to}" RETURN from, to`
				var response = await web.cypher(query)

				// if relation is not found, create it
				if(response.result.length === 0) {
					return await this.connect(edge.from, edge.relation, edge.to,  MATCH_BY_ID, edge.attributes)
				}
			} catch(e) {
				console.log(e)
				throw('Merge connection failed!')
			}
		} else {
			throw('Edge is not comple!\n' + edge)
		}

	}





	async getEdgeTargets(edge_rid) {
		edge_rid = this.checkHastag(edge_rid)

		const query = `MATCH (from)-[r]->(to) WHERE id(r) = "${edge_rid}" RETURN from, to`
		var response = await web.cypher( query)
		if(response.result.length > 0) {
			var data = {from: response.result[0].from['@rid'], to: response.result[0].to['@rid']}
			return data
		} else {
			throw(`Edge not found: ${edge_rid}`)
		}

	}


	checkHastag(rid) {
		if(!rid.match(/^#/)) rid = '#' + rid
		return rid
	}



	// data = {from:[RID] ,relation: '', to: [RID]}
	async connect(from, relation, to, match_by_id, attributes, auth_header) {
		console.log('Connectiong vertices...')

		try {
			if(await this.hasConnectPermissions(from, to, auth_header)) {

				var attributes_str = ''
				var relation_type = ''

				if(!match_by_id) {
					from = this.checkHastag(from)
					to = this.checkHastag(to)
				}
				const permissions = await this.hasConnectPermissions(from, to, auth_header)
				
				if(typeof relation == 'object') {
					relation_type = relation.type
					if(relation.attributes)
						attributes_str = this.createAttributeCypher(relation.attributes)
				} else if (typeof relation == 'string') {
					relation_type = relation
				}

				if(attributes) attributes_str = this.createAttributeCypher(attributes)
				console.log(attributes_str)
		
				// when we link normally, we use RID
				var query = `MATCH (from), (to) WHERE id(from) = "${from}" AND id(to) = "${to}" CREATE (from)-[r:${relation_type} ${attributes_str}]->(to) RETURN from, r, to`
				// when we import stuff, then we connect by id
				if(match_by_id) {
					query = `MATCH (from), (to) WHERE from.id = "${from}" AND to.id = "${to}" CREATE (from)-[r:${relation_type} ${attributes_str}]->(to) RETURN from, r, to`
				}
		
				return web.cypher( query)
			}
		} catch (e) {
			console.log(e)
			throw('Connection creation failed ')
		}

	}



	// delete edge based on edge type and source and target RIDs
	async unconnect(data) {
		try {
			data.from = this.checkHastag(data.from)
			data.to = this.checkHastag(data.to)

			var query = `MATCH (from)-[r:${data.rel_type}]->(to) WHERE id(from) = "${data.from}" AND id(to) = "${data.to}" DELETE r RETURN from`
			return web.cypher( query)
		} catch(e) {
			console.log(e)
			throw('Connection removal failed ')
		}
	}



	// delete edge based on edge RID
	async deleteEdge(rid, auth_header) {
		try {
			var targets = await this.getEdgeTargets(rid)
			if(await this.hasConnectPermissions(targets.from, targets.to, auth_header)) {
				rid = this.checkHastag(rid)
				var query = `MATCH (from)-[r]->(to) WHERE id(r) = '${rid}' DELETE r`
				return web.cypher( query)
			} else {
				throw('No rights to delete edge')
			}

		} catch(e) {
			console.log(e)
			throw('Deleting edge failed ')
		}
	}



	async setEdgeAttribute(rid, data, auth_header) {
		try {
			var targets = await this.getEdgeTargets(rid)
			if(this.hasEdgeAttributePermissions(targets.from, targets.to, auth_header)) {
				rid = this.checkHastag(rid)
				let query = `MATCH (from)-[r]->(to) WHERE id(r) = '${rid}' `
				if(Array.isArray(data.value)) {
					if(data.value.length > 0) {
						data.value = data.value.map(i => `'${i}'`).join(',')
						query = query + `SET r.${data.name} = [${data.value}]`
					} else {
						query = query + `SET r.${data.name} = []`
					}
				} else if(typeof data.value == 'boolean' || typeof data.value == 'number') {
					query = query + `SET r.${data.name} = ${data.value}`
				} else if(typeof data.value == 'string') {
							query = query + `SET r.${data.name} = '${data.value.replace(/'/g,"\\'")}'`
				}
				return web.cypher( query)
			} else {
				throw('No rights to set edge attributes')
			}

		} catch(e) {
			console.log(e)
			throw('Edge attribut setting failed ' + e)
		}

	}



	async setNodeAttribute(rid, data, auth_header) {
		try {
			if(this.hasNodeAttributePermissions(rid, auth_header)) {
				rid = this.checkHastag(rid)
				let query = `MATCH (node) WHERE id(node) = '${rid}' `
		
				if(Array.isArray(data.value) && data.value.length > 0) {
					data.value = data.value.map(i => `'${i}'`).join(',')
					query = `SET node.${data.key} = [${data.value}]`
				} else if(typeof data.value == 'boolean') {
					query = query + `SET node.${data.key} = ${data.value}`
				} else if(typeof data.value == 'string') {
					query = query + `SET node.${data.key} = '${data.value.replace(/'/g,"\\'")}'`
				}
				return web.cypher( query)
			} else {
				throw('No rights to set node attributes')
			}

		} catch(e) {
			console.log(e)
			throw('Node attribute setting failed ' + e)
		}

	}



	async getNodeAttributes(rid) {
		rid = this.checkHastag(rid)
		var query = `MATCH (node) WHERE id(node) = '${rid}' RETURN node`
		return web.cypher( query)
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

		return web.cypher( body.query, options)
	}



	async getGraphByNode(body, ctx) {

		var me = await this.myId(ctx.request.headers.mail)
		var schema_relations = null
		// get schemas first so that one can map relations to labels
		schema_relations = await this.getSchemaRelations()
		
		const options = {
			serializer: 'graph',
			format: 'cytoscape',
			schemas: schema_relations,
			current: body.current,
			me: me
		}

		const query = `MATCH (p) WHERE id(p) = "#${body.current}" OPTIONAL MATCH (p)-[r]-(t) RETURN p,r,t`

		return web.cypher(query, options)
	}


	async getGraphByRelation(body, ctx) {

		var me = await this.myId(ctx.request.headers.mail)
		var schema_relations = null
		// get schemas first so that one can map relations to labels
		schema_relations = await this.getSchemaRelations()
		
		const options = {
			serializer: 'graph',
			format: 'cytoscape',
			schemas: schema_relations,
			current: body.current,
			me: me
		}

		const query = `MATCH (p) WHERE id(p) = "${body.current}" OPTIONAL MATCH (p)-[r:${body.relation}]-(t) RETURN p,r,t`

		return web.cypher(query, options)
	}


	async getGraphNavigation(body, ctx) {

		var me = await this.myId(ctx.request.headers.mail)
		var schema_relations = null
		// get schemas first so that one can map relations to labels
		schema_relations = await this.getSchemaRelations()
		
		const options = {
			serializer: 'graph',
			format: 'cytoscape',
			schemas: schema_relations,
			me: me
		}

		const query = 	`match (s) WHERE s:Query OR s:Menu OR s:UserGroup  OPTIONAL MATCH (s)-[r]-(p) OPTIONAL MATCH (p)-[r2]-(group) return s,p, r, group, r2`

		return web.cypher(query, options)
	}



	async getGraphByQueryRID(body, ctx) {

		var me = await this.myId(ctx.request.headers.mail)
		var schema_relations = null
		// get schemas first so that one can map relations to labels
		schema_relations = await this.getSchemaRelations()
		
		const options = {
			serializer: 'graph',
			format: 'cytoscape',
			schemas: schema_relations,
			me: me
		}

		const query = 	`MATCH (query:Query) WHERE id(query) = "#${body.rid}" RETURN query`

		var response = await web.cypher(query)
		if(response.result && response.result.length == 1) {
			return web.cypher(response.result[0].query, options)
		}
	}


	async getLinkedByNode(body, ctx) {

		var me = await this.myId(ctx.request.headers.mail)
		var schema_relations = null
		// get schemas first so that one can map relations to labels
		schema_relations = await this.getSchemaRelations()
		
		const options = {
			serializer: 'graph',
			format: 'cytoscape',
			schemas: schema_relations,
			me: me
		}

		const query = 	`MATCH (node)-[r]-(current:${body.type}) WHERE id(current) = "#${body.current}" RETURN node, r, current`

		return web.cypher(query, options)
	}


	async getGraphByItemList(body, ctx) {
		const items_str = body.items.map(x => `'#${x}'`).join(',')
		var me = await this.myId(ctx.request.headers.mail)
		var schema_relations = null
		// get schemas first so that one can map relations to labels
		schema_relations = await this.getSchemaRelations()
		
		const options = {
			serializer: 'graph',
			format: 'cytoscape',
			schemas: schema_relations,
			me: me
		}
		const query = `MATCH (p)  WHERE id(p) IN [${items_str}] OPTIONAL MATCH (p)-[r]-(p2) WHERE id(p2) IN [${items_str}] RETURN p, r, p2`
		return web.cypher(query, options, 1)
	}


	async getSchemaGraph() {
		var schema_relations = null
		// get schemas first so that one can map relations to labels
		schema_relations = await this.getSchemaRelations()
		
		const options = {
			serializer: 'graph',
			format: 'cytoscape',
			schemas: schema_relations
		}
		const query = `MATCH (s:Schema) WHERE NOT s._type IN ["Menu", "Query", "UserGroup", "Tag", "NodeGroup"] OPTIONAL MATCH (s)-[r]-(s2:Schema)  return s,r,s2`
		return await web.cypher(query, options)
	}

	async getSchemaGraphByTag(tag) {
		var schema_relations = null
		// get schemas first so that one can map relations to labels
		schema_relations = await this.getSchemaRelations()
		
		const options = {
			serializer: 'graph',
			format: 'cytoscape',
			schemas: schema_relations
		}
		const query = 
		`MATCH (s:Schema)-[r]-(s2:Schema) WHERE NOT s._type IN ["Menu", "Query", "UserGroup", "Tag", "NodeGroup"] AND "${tag}" IN r.tags return s,r,s2`
		return await web.cypher(query, options)
	}


	async getMapPositions(body, ctx) {

		const query = 'MATCH (n)-[r]-(map:QueryMap) RETURN r.x as x, r.y as y, id(n) as id'
		return web.cypher(query)
	}
	


	async getSchemaRelations() {
		var schema_relations = {}
		var schemas = await web.cypher( 'MATCH (s:Schema)-[r]->(s2:Schema) return type(r) as type, r.label as label, r.label_rev as label_rev, COALESCE(r.label_inactive, r.label) as label_inactive, s._type as from, s2._type as to, r.tags as tags, r.compound as compound')
		schemas.result.forEach(x => {
			schema_relations[`${x.from}:${x.type}:${x.to}`] = x
		})
		return schema_relations
	}


	async getSearchData(search) {
		if(search[0]) {
			var arr = search[0].result.map(x => '"' + x + '"')
			var query = `MATCH (n) WHERE id(n) in [${arr.join(',')}] AND NOT n:Schema return id(n) as id, n.label as label, labels(n) as type LIMIT 10`
			return web.cypher( query)
		} else {
			return {result:[]}
		}
	}


	checkRelationData(data) {
		if(data.from) {
			data.from = this.checkHastag(data.from)
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
			console.log(key)
			console.log('.............')
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


	async checkMe(user, access) {

		var rights = 'user'
		if(['user', 'creator', 'admin'].includes(access)) rights = access

		if(!user) throw('user not defined')
		var query = `MATCH (me:Person {id:"${user}"}) return id(me) as rid, me._group as group, me._access as access`
		var result = await web.cypher(query)

		// add user if not found
		if(result.result.length == 0) {
			
			query = `MERGE (p:Person {id: "${user}"}) SET p.label = "${user}", p._group = 'user', p._active = true, p._access = '${rights}'`

			result = await web.cypher(query)
			query = `MATCH (me:Person {id:"${user}"}) return id(me) as rid, me._group as group`
			result = await web.cypher(query)

			return result.result[0]
		} else return result.result[0]
	}


	async myId(user) {
		if(!user) throw('user not defined')
		var query = `MATCH (me:Person {id:"${user}"}) return id(me) as rid, me._group as group, me._access as access`
		var response = await web.cypher(query)
		if(!response.result) throw('user not found!')
		return response.result[0]
	}


	async getGroups() {
		var query = 'MATCH (x:UserGroup) RETURN x.label as label, x.id as id'
		var result = await web.cypher( query)
		return result.result
	}


	async getMaps() {
		var query = 'MATCH (t:QueryMap) RETURN t order by t.label'
		var result = await web.cypher( query)
		return result.result
	}


	async getMenus(group) {
		//var query = 'MATCH (m:Menu) return m'
		var query = `MATCH (m:Menu) -[:VISIBLE_FOR_GROUP]->(n:UserGroup {id:"${group}"}) OPTIONAL MATCH (m)-[]-(q) WHERE q:Query OR q:Tag RETURN COLLECT( q) AS items, m.label as label, m.id as id ORDER BY id`
		var result = await web.cypher( query)
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

		return web.cypher( query, 'graph')
	}


	// get list of documents WITHOUT certain relation
	// NOTE: open cypher bundled with Arcadedb did not work with "MATCH NOT (n)-[]-()"" -format. This could be done with other query language.
	async getListByType(query_params) {
		var query = `MATCH (n) return n.label as text, id(n) as value ORDER by text`
		if(query_params.type) query = `MATCH (n:${query_params.type}) return n.label as text, id(n) as value ORDER by text`
		var all = await web.cypher( query)
		if(query_params.relation && query_params.target) {
			query = `MATCH (n:${query_params.type})-[r:${query_params.relation}]-(t) WHERE id(t) = "#${query_params.target}" return COLLECT(id(n)) as ids`
			var linked = await web.cypher( query)
			//console.log(linked.result)
			//console.log(all.result)
			var r = all.result.filter(item => !linked.result[0].ids.includes(item.value));
			//console.log(r)
			return r

		} else {
			return all
		}
	}


	async getStory(rid) {
		if(!rid.match(/^#/)) rid = '#' + rid
		var query = `MATCH (s:Story) WHERE id(s) = '${rid}' RETURN s`
		var result = await web.cypher( query)

		if(result.result.length == 1) {
			var filename = 'story_' + rid + '.yaml'
			try {
				const file_path = path.resolve('./stories', filename)
				const data = await fsPromises.readFile(file_path, 'utf8')
				const story_data = yaml.load(data)
				return story_data
			} catch (e) {
				throw(e)
			}
		} else {
			throw('Not found')
		}
	}

	async importGraphYAML(filename, mode, auth_header) {
		console.log(`** importing graph ${filename} with mode ${mode} **`)
		try {
			const file_path = path.resolve('./graph', filename)
			const data = await fsPromises.readFile(file_path, 'utf8')
			const graph_data = yaml.load(data)
			const admin = await this.hasAdminPermissions(auth_header)

			if(admin) {
				if(mode == 'clear') {
					await web.clearGraph()
					await this.setSystemNodes()
					await this.createSystemGraph()
					await this.writeGraphToDB(graph_data, auth_header)
				} else {
					// otherwise we merge
					await this.mergeGraphToDB(graph_data)
				}
	
				this.createIndex()
			}

		} catch (e) {
			throw(e)
		}
		console.log('Done import')
	}


	async mergeGraphToDB(graph) {
		try {
			for(var node of graph.nodes) {
				const type = Object.keys(node)[0]
				await this.merge(type, node)
			}
			for(var edge of graph.edges) {
				if(edge.Edge) await this.mergeConnect(edge.Edge)
			}
		} catch (e) {
			throw(e)
		}
	}


	async writeGraphToDB(graph, auth_header) {
		try {
			for(var node of graph.nodes) {
				const type = Object.keys(node)[0]
				await this.create(type, node[type], auth_header)
			}

			for(var edge of graph.edges) {
				// edges object format
				if(edge.Edge) {
					await this.connect(edge.Edge.from, edge.Edge.relation, edge.Edge.to, true, edge.Edge.attributes, auth_header)
				// edges string format
				} else {
					const edge_key = Object.keys(edge)[0]
					const splitted = edge_key.split('->')
					if(splitted.length == 3) {
						const link = splitted[1].trim()
						const [from_type, ...from_rest]= splitted[0].split(':')
						const [to_type, ...to_rest] = splitted[2].split(':')
						const from_id = from_rest.join(':').trim()
						const to_id = to_rest.join(':').trim()
						await this.connect(from_id, link, to_id, true, edge[edge_key], auth_header)
					} else {
						throw('Graph edge error: ' + Object.keys(edge)[0])
					}
				}
			}
		} catch (e) {
			throw(e)
		}
	}


	async exportGraphYAML(filename) {
		if(!filename) throw('You need to give a file name! ')
		var vertex_ids = {}
		var edge_ids = {}
		var query = 'MATCH (n) WHERE NOT n:Schema OPTIONAL MATCH (n)-[r]-() RETURN n, r '
		var schemas = await web.cypher( query, {serializer: 'graph'})
		var output = {nodes: [], edges: []}
		for(var vertex of schemas.result.vertices) {
			if(!vertex_ids[vertex.r]) {
				 var node_obj = {}
				 console.log(vertex)
				 var type = vertex.p['@type']
				 // old serializer backup
				 if(vertex.t) type = vertex.t
				  
				 node_obj[type] = {...vertex.p}
				 // make sure there is label property
				 if(!node_obj[type].label) node_obj[type].label = type
	
				 delete(node_obj[type]['@cat'])
				 if(!node_obj[type].id) {
					if(node_obj[type]['@rid'])
						node_obj[type].id = node_obj[type]['@rid'].replace('#','')
					else if(vertex.r)
						node_obj[type].id = vertex.r.replace('#','')
					else 
						console.log('WARNING: id not found')
						console.log(vertex)
				 }
				 output.nodes.push(node_obj)
				 vertex_ids[vertex.r] = type + ':' + node_obj[type].id
			}
		}

		for(var edge of schemas.result.edges) {
			
			var to = vertex_ids[edge.i]
			var from = vertex_ids[edge.o]
			var edge_name = from + '->' + edge.t + '->' + to
			if(!edge_ids[edge_name]) {
				var edge_obj = {}
				edge_obj[edge_name] = {attr: edge.p.attr, tags: edge.p.tags}
				output.edges.push(edge_obj)
				edge_ids[edge_name] = edge_obj
			}
		}
		const filePath = path.resolve('./graph', filename)
		await fsPromises.writeFile(filePath, yaml.dump(output), 'utf8')
		return {file: filePath}
	}



	async exportText() {
		// list all data for RAG
		var items = []
		var output = []

		// first all types
		const type_query = "MATCH (s:Schema) WHERE NOT s._type IN ['UserGroup', 'Menu', 'Query', 'Tag'] return s._type AS type"
		var schemas = await web.cypher(type_query)

		for(var schema of schemas.result) {
			const query = `MATCH (n:${schema.type})-[]-(p) RETURN DISTINCT id(n) AS rid`
			var rids = await web.cypher(query)
			
			for(var rid of rids.result) {
				var item = await this.getDataWithSchema(rid.rid)
				console.log(item)
				
				output.push('\n\n')

				output.push(item._attributes['@type'].toUpperCase() + ': ' + item._attributes.label)
				//output.push('name: ' + item._attributes.label)

				
				if(item._attributes.description)
					output.push('description: ' + item._attributes.description)
		
				for (var tag in item.tags) {
					if(item.tags[tag].count) {
						var rel_count = 1
						for(var relation of item.tags[tag].relations) {
							if(relation.data.length) {
								output.push(`\n${rel_count}. ${relation.label} (${relation.target_label})`)
								for(var target of relation.data) {
									output.push(`  - ${target.label}`)
									if(target.rel_attr) output.push('     ' + target.rel_attr)
								}
							rel_count++
							}
						}
					}
				}
				items.push(item)
			}
		}

		return output.join('\n')

	}


	async exportJSON() {
		// list all data for RAG
		var items = []

		// first all types
		const type_query = "MATCH (s:Schema) WHERE NOT s._type IN ['UserGroup', 'Menu', 'Query', 'Tag'] return s._type AS type"
		var schemas = await web.cypher(type_query)

		for(var schema of schemas.result) {
			const query = `MATCH (n:${schema.type})-[]-(p) RETURN DISTINCT id(n) AS rid`
			var rids = await web.cypher(query)
			
			for(var rid of rids.result) {
				var item = await this.getDataWithSchema(rid.rid)
				console.log(item)
				var json = {metadata:{rid: rid.rid}, pageContent:''}
				var content = []

				content.push(item._attributes['@type'].toUpperCase() + ': ' + item._attributes.label)
				
				if(item._attributes.description)
					content.push('description: ' + item._attributes.description)
		
				for (var tag in item.tags) {
					if(item.tags[tag].count) {
						var rel_count = 1
						for(var relation of item.tags[tag].relations) {
							if(relation.data.length) {
								content.push(`\n${rel_count}. ${relation.label} (${relation.target_label})`)
								for(var target of relation.data) {
									content.push(`  - ${target.label}`)
									if(target.rel_attr) content.push('     ' + target.rel_attr)
								}
							rel_count++
							}
						}
					}
				}
				json.pageContent = content.join('\n')
				items.push(json)
			}
		}

		return items

	}


	async mergeFIX(type, schema_type) {
		const c_query = `MATCH (n:${type}) return count(n) as count`
		var count = await web.cypher( c_query)
		if(count.result[0].count === 0) {
			var query = `CREATE (c:${type})
				set c._type = "${schema_type}"`
			await web.cypher( query)
		}
	}


	async getNodeCount(type) {
		var query = `MATCH (t:${type}) RETURN count(t) AS count`
		return await web.cypher( query)
	}

	async getTags() {
		var query = 'MATCH (t:Tag) RETURN t order by t.id'
		return await web.cypher( query)
	}


	async getQueries() {
		var query = 'MATCH (t:Query)  RETURN t'
		return await web.cypher( query)
	}


	async getStyles() {
		var query = 'MATCH (s:Schema) return COALESCE(s._style,"") as style, s._type as type'
		return await web.cypher( query)
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


	async getItemList(nodetype) {
		const query = 	`MATCH (s:${nodetype}) RETURN s.label AS label, s.description AS description, id(s) AS rid ORDER BY label`
		return await web.cypher( query)
	}


	async setLayout(body, me) {

		var query = ''
		var filename = ''
		if(!body.target || !body.data) throw('data missing')

		// admins can save common layouts (like schema) and any users layout
		if(me.access == 'admin') {
			if(COMMON_LAYOUTS.includes(body.target)) {
				filename = `layout_${body.target}-${body.target}.json`
				
			} else {
				if(!body.target.match(/^#/)) body.target = '#' + body.target
				filename = `layout_${body.target}-${body.target}.json`
			}
		// other users can save only their own layout
		} else {
			if(!body.target.match(/^#/)) body.target = '#' + body.target
			if(body.target == me.rid)
				filename = `layout_${body.target}-${me.rid}.json`
			else
				throw('No permissions')
		}

		if(filename) {
			const filePath = path.resolve('./layouts', filename)
			await fsPromises.writeFile(filePath, JSON.stringify(body.data), 'utf8')
		}

	
	}


	async getLayoutByTarget(rid, me) {

		var filename = ''
		if(COMMON_LAYOUTS .includes(rid)) {
			filename = `layout_${rid}-${rid}.json`

		} else {
			if(!rid.match(/^#/)) rid = '#' + rid
			if(me.rid === rid) filename = `layout_${rid}-${me.rid}.json`
			else filename = `layout_${rid}-${rid}.json`
		}

		try {
			const filePath = path.resolve('./layouts', filename)
			var locations = await fsPromises.readFile(filePath, 'utf8')
			var data = JSON.parse(locations)
			return {positions: data}
		} catch (e) {
			return []
		}

	}


	async getStats() {
		const query = 'MATCH (n) RETURN DISTINCT LABELS(n) as labels, COUNT(n) as count  ORDER by count DESC'
		const result =  await web.cypher( query)
		return result
	}


	async getDataWithSchema(rid, by_tags) {
		by_tags = 1

		if(!rid.match(/^#/)) rid = '#' + rid
		var data = await web.cypher( `MATCH (source) WHERE id(source) = "${rid}" OPTIONAL MATCH (source)-[rel]-(target)  return source, rel, target ORDER by target.label`)
		if(data.result.length == 0) return []

		var type = data.result[0].source['@type']
		data.result[0].source = await schema.getSchemaAttributes(type, data.result[0].source)
		var relations = await schema.getSchemaRelations(type)


		// add every existing relationship as "data" under relation in schema
		for(var relation of relations) {

			//data.result.forEach(x => console.log(`${type}:${x.rel['@type']}:${x.target['@type']}`))
			relation.data = data.result.filter(ele => {
				if(ele.rel && ele.rel['@type'] == relation.type) {
					// we know that relation *source* is 'data.result[0].source['@type']'
					// so not need to test it
					if(relation.target == ele.target['@type'])
					 	return ele
				}
				
			}).map(ele => {
				var rel_active = ele.rel._active
				if(typeof ele.rel._active === 'undefined') rel_active = true
				if(!ele.target._active) rel_active = false
				var out = {
						id: ele.target['@rid'],
						type: ele.target['@type'],
						label: ele.target['label'],
						label_rev: ele.target['label_rev'],
						rel_id: ele.rel['@rid'],
						rel_active: rel_active
					}

				if(ele.rel['attr']) out.rel_attr = ele.rel['attr']
				// QueryMap locations
				if(ele.rel['x']) out.x = ele.rel['x']
				if(ele.rel['y']) out.y = ele.rel['y']

				return out
			})
			
		}

		// group schema relations (and relation data) under tags
		if(by_tags) {
			const tags = await this.getTags()
			var out = {
				_attributes: data.result[0].source,
				tags: {}
			}
			for(var tag of tags.result) {
				var tag_label = tag.label ? tag.label : tag.id
				out.tags[tag.id] = {
					relations:[],
					label: tag_label,
					count: 0
				}
			}

			var default_group = {
				relations:[],
				label: 'misc',
				count: 0
			}
			var default_display = {
				relations:[],
				label:'default',
				count: 0
			}

			for(var relation of relations) {
				if(relation.display && relation.display == 'default') {
					default_display.relations.push(relation)
					default_display.count = default_display.count + relation.data.length
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
						default_group.relations.push(relation)
						default_group.count = default_group.count + relation.data.length
					}

					// if no tag found, then push to default group
				} else {
					default_group.relations.push(relation)
					default_group.count = default_group.count + relation.data.length
				}
				

			}
			out.tags.default_group = default_group

			return out
		} else {
			return relations
		}
	}
}
