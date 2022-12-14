const axios = require("axios")
const web = require("./web.js")
var host = process.env.ARCADEDB_HOST || 'localhost'
const URL = `http://${host}:2480/api/v1/command/kukako`
const GITLAB_URL = 'https://gitlab.kopla.jyu.fi/api/v4'
const TOKEN = process.env.GITLAB_TOKEN

const PERSONS = [
	{	id: "ari.hayrinen@jyu.fi",
		username: "arihayri",
		emails:["ari.hayrinen@gmail.com", "arihayri@jyu.fi", "ari.hayrinen@jyu.fi", "arihayri@osc2203-01.lib.jyu.fi"]
	},
	{	id: "veli-matti.hakkinen@jyu.fi",
		username: "veanha",
		emails:["veli-matti.hakkinen@jyu.fi", "veanha@jyu.fi"]
	},
	{	id: "jussi.t.pajari@jyu.fi",
		username: "jupajari",
		emails:["jussi.t.pajari@jyu.fi", "jupajari@jyu.fi", "jupajari@osc2106-01.lib.jyu.fi", "jussi.pajari@gmail.com"]
	},
	{	id: "hannamari.h.heiniluoma@jyu.fi",
		username: "veanha",
		emails:["hannamari.h.heiniluoma@jyu.fi", "hahelle@jyu.fi","hannamari.heiniluoma@gmail.com"]
	},
	{	id: "toni.m.tourunen@jyu.fi",
		username: "tomatour",
		emails:["toni.m.tourunen@jyu.fi", "tomatour@jyu.fi"]
	},
]

module.exports = class Gitlab {



	async getRepositories () {
		var data = []
		var url = `${GITLAB_URL}/groups/osc/projects?private_token=${TOKEN}&per_page=50&order_by=last_activity_at&sort=desc`
		console.log('Fetching from gitlab...')
		var result = await axios.get(url)
		data = result.data
		for(var i=0; 1<100; i++) {
			console.log(result.headers['x-next-page'])
			if(result.headers['x-next-page']) {
				var result2 = await axios.get(url + '&page=' + result.headers['x-next-page'])
				result.headers['x-next-page'] = result2.headers['x-next-page']
				console.log(result2.data.length)
				data = [].concat(data, result2.data)
			} else {
				break
			}
		}
		return data
	}


	async getCommits(id) {
		var url = `${GITLAB_URL}/projects/${id}/repository/commits?private_token=${TOKEN}`
		var result = await axios.get(url)
		var out = []
		for(var commit of result.data) {
			var d = commit.created_at.split('T')[0]
			out.push({
				date: d,
				title: commit.title,
				author: commit.author_name,
				url: commit.web_url
			})
		}
		return out
	}

	async updateBaseImages(repos) {
		var base_images = []
		if(!repos) repos = await this.getRepositories()
		for(var repo of repos) {
			var url = `${GITLAB_URL}/projects/${repo.id}/repository/files/Dockerfile/raw?ref=master&private_token=${TOKEN}`
			try {
				var result = await axios.get(url)
				var lines = result.data.split('\n')
				var base_image = ''
				for(var line of lines) {
					if(line.startsWith('FROM')) {
						base_image = line.replace('FROM ','')
					}
				}
				console.log(base_image + ' ' + repo.name)
				base_images.push({id: base_image, repository: repo.id})
			} catch(e) {
				console.log('Dockerfile not found for project ' + repo.name)
			}
		}

		if(base_images.length) {
			await this.mergeFIX('BaseImage', base_images[0].id)
		}

		// create items
		for(var item of base_images) {
			var query = `MERGE (c:BaseImage {id:"${item.id}"})
			SET c.label = '${item.id}',
			c._active = true`

			try {
				await web.cypher(URL, query)
			} catch(e) {
				console.log(query)
			}
		}
		// link to repos
		for(var item of base_images) {
			var query = `MATCH (base:BaseImage {id:"${item.id}"}), (r:Repository {id:"${item.repository}"}) WHERE (image:DockerImage)-[:BUILT_FROM]->(r) MERGE (image)-[:IS_BASED_ON_BASEIMAGE]->(base)`
			try {
				await web.cypher(URL, query)
			} catch(e) {
				console.log(query)
			}
		}
	}

	async updateProgrammingLanguages(repos) {
		const languages = new Set()
		var main_languages = []
		var side_languages = []
		if(!repos) repos = await this.getRepositories()
		for(var repo of repos) {
			var url = `${GITLAB_URL}/projects/${repo.id}/languages?private_token=${TOKEN}`
			try {
				var result = await axios.get(url)
				console.log(repo.name)
				console.log(result.data)
				for(const language in result.data) {
					languages.add(language)
				}
				if(Object.keys(result.data).length > 0) {
					const key = Object.keys(result.data)[0]
					main_languages.push({lang: key, repository: repo.id, percentage: result.data[key]})
					// remove main language from list
					delete result.data[key]
					for(var lang in result.data) {
						side_languages.push({lang: lang, repository: repo.id, percentage: result.data[lang]})
					}
				}
			} catch(e) {
				console.log('Makefile not found for project ' + repo.name)
			}
		}
		console.log('get programming languages done!')

		if(languages.size > 0) {
			await this.mergeFIX('ProgrammingLanguage', [...languages][0])
		}

		// Merge languages
		for(const lang of languages) {
			var query = `MERGE (c:ProgrammingLanguage {id:"${lang}"})
			SET c.label = '${lang}',
			c._active = true`

			try {
				await web.cypher(URL, query)
			} catch(e) {
				console.log(query)
			}
		}

		for(const item of main_languages) {
			var query = `MATCH (language:ProgrammingLanguage), (repo:Repository) WHERE language.id = "${item.lang}" AND repo.id = "${item.repository}" MERGE (language)-[:IS_MAIN_LANGUAGE_OF {description: "${item.percentage}"}]->(repo)`
			try {
				await web.cypher(URL, query)
			} catch (e) {
				console.log(e)
			}
		}

		for(const item of side_languages) {
			var query = `MATCH (language:ProgrammingLanguage), (repo:Repository) WHERE language.id = "${item.lang}" AND repo.id = "${item.repository}" MERGE (language)-[:IS_LANGUAGE_OF {description: "${item.percentage}"}]->(repo)`
			try {
				await web.cypher(URL, query)
			} catch (e) {
				console.log(e)
			}
		}

	}

	// parse Makefile in order to find docker image name
	async linkToDockerImages(repos) {
		var images = []
		if(!repos) repos = await this.getRepositories()
		for(var repo of repos) {
			var url = `${GITLAB_URL}/projects/${repo.id}/repository/files/Makefile/raw?ref=master&private_token=${TOKEN}`
			try {
				var result = await axios.get(url)
				var lines = result.data.split('\n')
				var variables = {}
				var image = ''
				for(const [index, line] of lines.entries()) {
					if(line.includes(':=')) {
						var splitted = line.split(':=')
						variables[splitted[0].trim()] = splitted[1].trim()
					}
					if(line.startsWith('build:')) {
						image = lines[index + 1].replace('docker','')
						image = image.replace(/\t/g, '')
						image = image.replace(/\r/g, '')
						image = image.replace(' .', '')
						image = image.replace('-t', '')
						image = image.replace('-f Dockerfile', '')
						image = image.replace('--platform', '')
						image = image.replace('buildx', '')
						image = image.replace('build', '')
						image = image.replace('linux/amd64', '')
						image = image.replace('@ ', '')
						image = image.trim()

					}
				}
				console.log(variables)
				console.log(image + ' ' + repo.name)
				for(var variable in variables) {
					image = image.replace(`$(${variable})`, variables[variable])
				}
				if(image != '')
					images.push({id: image, repository: repo.id})
			} catch(e) {
				console.log('Makefile not found for project ' + repo.name)
			}
		}

		for(var item of images) {
			console.log(item)
			var query = `MATCH (image:DockerImage), (repo:Repository) WHERE image.label = "${item.id}" AND repo.id = "${item.repository}" MERGE (image)-[:BUILT_FROM]->(repo)`
			await web.cypher(URL, query)

		}
	}

	async mergeFIX(type, id) {
		const c_query = `MATCH (n:${type}) return count(n) as count`
		var count = await web.cypher(URL, c_query)
		if(count.result[0].count === 0) {
			var query = `CREATE (c:${type} {id:"${id}"})`
			await web.cypher(URL, query)
		}
	}

	async update() {
		var repos = await this.getRepositories()
		// because of bug in ArcadeDB's Cypher implementation of "merge"
		// we must create first item with "create"
		if(repos.length) {
			await this.mergeFIX('Repository', repos[0].id, repos[0].name)
		}

		for(var repo of repos) {
			var d_str = repo.created_at.split('T')[0]
			repo.description = repo.description.replace(/\'/g,"'")
			var query = `MERGE (c:Repository {id:"${repo.id}"})
			SET c.label = '${repo.name}',
			c.description = '${repo.description}',
			c.url = '${repo.web_url}',
			c.created = '${d_str}',
			c._active = true
			`
			try {
				await web.cypher(URL, query)
			} catch(e) {

				console.log(e)
			}
		}
		await this.matchCommitters(repos)
		await this.updateBaseImages(repos)
		await this.linkToDockerImages(repos)
		await this.updateProgrammingLanguages(repos)
		return 'done'
	}

	async matchCommitters(repos) {

		for(var repo of repos) {
			var url = `${GITLAB_URL}/projects/${repo.id}/repository/commits?private_token=${TOKEN}&per_page=50&order_by=last_activity_at&sort=desc`
			const committers = new Set();
			var response = await axios.get(url)
			for(var commit of response.data) {
				for(var person of PERSONS) {
					if(person.emails.includes(commit.author_email)) {
						committers.add(person.id)
					}
				}
			}

			for(let committer of committers) {
				var query = `match (r:Repository {id:"${repo.id}"}),(p:Person {id:"${committer}"}) MERGE (p)-[:IS_COMMITTER_OF]->(r) return r,p`
				await web.cypher(URL, query)
			}
		}

	}
}
