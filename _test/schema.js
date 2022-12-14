const axios = require("axios")
const web = require("./../web.js")

if(!process.env.MODE || process.env.MODE != 'development') {
	console.log('Running tests will DELETE all data!')
	console.log('Set MODE environment variable to "development" if you want to run tests')
	console.log('MODE=development npm test')
	process.exit(1)
}


const DB_HOST = process.env.ARCADEDB_HOST || 'localhost'
const URL = `http://${DB_HOST}:2480/api/v1`


before((done) => {
	(async (done) => {

        try {
			var url = URL + '/drop/kukako'
			await web.cypher(url)
			console.log('dropped database')
		} catch(e) {
			console.log('Could not drop database')
			console.log(e)
		}

        try {
			var url = URL + '/create/kukako'
			await web.cypher(url)
		} catch(e) {
			console.log('Could not create database')
		}

		try {
			var query = 'MATCH (n) DETACH DELETE n'
			var url = URL + '/command/kukako'
			await web.cypher(url, query)
		} catch(e) {
			console.log('Could not delete data')
		}


		//SCHEMA
		try {
			// system
			var url = URL + '/command/kukako'
			var query = 'Create (s:Schema {_type:"Menu", id:""})'
			await web.cypher(url, query)
			var query = 'Create (s:Schema {_type:"Tag", id:"", layout:"fcose"})'
			await web.cypher(url, query)
			var query = 'Create (s:Schema {_type:"Query", query:""})'
			await web.cypher(url, query)
			var query = 'Create (s:Schema {_type:"UserGroup", id:""})'
			await web.cypher(url, query)
			var query = 'Create (s:Schema {_type:"NodeGroup"})'
			await web.cypher(url, query)

			var query = 'Create (s:Schema {_type: "Person", label:"Person", id:""})'
			await web.cypher(url, query)

			// schema relationships
			var query = 'MATCH(s:Schema {_type:"Menu"}), (t:Schema {_type:"UserGroup"}) CREATE (s)-[r:VISIBLE_FOR_GROUP]->(t) set r.label = "visible for user group(s)", r.label_rev = "visible menus", r.tags = ["system"], r.display = "default" return r'
			await web.cypher(url, query)
			var query = 'MATCH(s:Schema {_type:"Query"}), (t:Schema {_type:"Menu"}) CREATE (s)-[r:IN_MENU]->(t) set r.label = "shown in menu", r.label_rev = "queries", r.tags = ["system"], r.display = "default" return r'
			await web.cypher(url, query)
			var query = 'MATCH(s:Schema {_type:"Tag"}), (t:Schema {_type:"Menu"}) CREATE (s)-[r:PART_OF_MENU]->(t) set r.label = "shown in menu", r.label_rev = "tags", r.tags = ["system"], r.display = "default" return r'
			await web.cypher(url, query)

			// default user group
			var query = 'Create (s:UserGroup {id:"user", label:"Basic", _active: true})'
			await web.cypher(url, query)

			// default user group
			var query = 'Create (s:NodeGroup {id:"public", label:"Public", _active: true})'
			await web.cypher(url, query)

			// default menus
			var query = 'Create (s:Menu {id:"me", label:"Minä", _active: true})'
			await web.cypher(url, query)
			var query = 'MATCH(s:Menu {id:"me"}), (t:UserGroup {id:"user"}) CREATE (s)-[r:VISIBLE_FOR_GROUP]->(t)'
			await web.cypher(url, query)

			// default tags
			var query = 'Create (s:Tag {id:"organisation", label:"Organisation", layout:"fcose"})'
			await web.cypher(url, query)

			// default queries
			var query = `Create (s:Query {label:"Services and users", _active: true, query:"MATCH (s:Service) OPTIONAL MATCH (s)-[r]-(t) WHERE NOT type(r) = 'USER_OF' return s,t"})`
			await web.cypher(url, query)
			var query = 'Create (s:Query {label:"All maintainers", _active: true, query:"MATCH (p:Person)-[:MAINTAINER_OF]-(t) return p,t"})'
			await web.cypher(url, query)
			var query = 'Create (s:Query {label:"Persons&Systems", _active: true, query:"MATCH (n)-[r]-(t) where NOT (n:Person)-[:USER_OF]-(t:Service) and NOT (n:Person)-[:MEMBER_OF]->(t:Team) and NOT t:Team and not n:Team and not n:Schema return n"})'
			await web.cypher(url, query)
			var query = 'Create (s:Query {label:"Site maintainers", _active: true, query:"MATCH (n:Person)-[r:CONTENT_MANAGER_OF]->(s:Site )return n,s"})'
			await web.cypher(url, query)
			var query = `Create (s:Query {label:"My Team", _active: true, query:"MATCH (q:Person)-[]->(t:Team)-[*..2]-(e) where id(q) = '_ME_' AND NOT e:Repository return q,t,e"})`
			await web.cypher(url, query)
			var query = `Create (s:Query {label:"Fellow developers", _active: true, groups:['devs'], query:"MATCH (p:Person)-[]-(r:Repository)-[]-(p2:Person) WHERE id(p) = '_ME_' return p,p2,r"})`
			await web.cypher(url, query)

			// default layout (in order to fix Cypher MERGE problem)
			var query = `Create (l:Layout {user:"dummy", target:"dummy", positions:""})`
			await web.cypher(url, query)

			// make sure that we have _activity
			var query = 'MATCH (p) SET p._active = true'
			await web.cypher(url, query)

			var query = 'MATCH (p)-[r]-(s) SET r._active = true'
			await web.cypher(url, query)

		} catch(e) {
			console.log('Could not create schema on test set')
		}

	})().then(() => {
		done();
	})
});
