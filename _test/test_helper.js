const axios = require("axios")
const web = require("./../web.js")


let url = "http://localhost:2480/api/v1";

before((done) => {
	(async (done) => {

		try {
			for(var i = 0; i < 5; i++) {
				var query = 'CREATE (t:Team {label:"Team '+i+'"}) RETURN t'
				var url = url + '/command/kukako'
				var team = await web.cypher(url, query)
				var team_id = team.result[0]['@rid']
				for(var j = 1; j < 20; j++) {
					var query = 'MATCH (t) WHERE id(t) = "' + team_id + '" CREATE (p:Person {label:"person '+(i*20+j)+'"})-[:MEMBER_OF]->(t)'
					var url = url + '/command/kukako'
					await web.cypher(url, query)
				}
			}
		} catch(e) {
			console.log('Could not create teams')
		}

		try {
			for(var i = 0; i < 5; i++) {
				var query = 'CREATE (t:Service {label:"Service '+i+'"}) RETURN t'
				var url = url + '/command/kukako'
				var s = await web.cypher(url, query)
				var system_id = s.result[0]['@rid']
				for(var j = 0; j < 20; j++) {
					var query = 'MATCH (p),(s) WHERE p.label IN ["person '+i*j+'"] AND id(s) = "' + system_id + '" CREATE (p)-[:USER_OF]->(s)'
					var url = url + '/command/kukako'
					await web.cypher(url, query)
				}
			}
		} catch(e) {
			console.log('Could not create teams')
		}



	})().then(() => {
		done();
	})
});
