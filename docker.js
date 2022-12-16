const web = require("./web.js")

var host = process.env.ARCADEDB_HOST || 'localhost'
const URL = `http://${host}:2480/api/v1/command/kukako`

module.exports = class Docker {

	async getDockerData(url) {
		const {got} = await import("got");
		var result = await got(url, {enableUnixSockets: true});
		var json = JSON.parse(result.body)
		return json
	}

	async getContainers() {
		const query = 'http://unix:/var/run/docker.sock:/containers/json?all=true'
		return this.getDockerData(query)
	}

	async getContainerTop(id) {
		const query = `http://unix:/var/run/docker.sock:/containers/${id}/top`
		return this.getDockerData(query)
	}

	async getContainerInspect(id) {
		const query = `http://unix:/var/run/docker.sock:/containers/${id}/json`
		return this.getDockerData(query)
	}

	async getContainerLogs(id) {
		const query = `http://unix:/var/run/docker.sock:/containers/${id}/logs`
		return this.getDockerData(query)
	}

	async getImages() {
		const query = 'http://unix:/var/run/docker.sock:/images/json'
		return this.getDockerData(query)
	}

	async getNetworks() {
		const query = 'http://unix:/var/run/docker.sock:/networks'
		return this.getDockerData(query)
	}

	async getVolumes() {
		const query = 'http://unix:/var/run/docker.sock:/volumes'
		var result = await this.getDockerData(query)
		return result.Volumes
	}

	async mergeFIX(type, id, label) {
		const c_query = `MATCH (n:${type}) return count(n) as count`
		var count = await web.cypher(c_query)
		if(count.result[0].count === 0) {
			var query = `CREATE (c:${type} {id:"${id}"})
				set c.label = "${label}"`
			await web.cypher(query)
		}
	}

	async cleanByTimestamp(type, timestamp) {
		const query = `MATCH (n:${type}) WHERE n.timestamp < ${timestamp} DETACH DELETE n`
	}

	async update() {
		var containers = await this.getContainers()
		var images = await this.getImages()
		var volumes = await this.getVolumes()
		var networks = await this.getNetworks()

		// because of bug in ArcadeDB's Cypher implementation of "merge"
		// we must create first item with "create"
		if(images.length) {
			await this.mergeFIX('DockerImage', images[0].Id, images[0].RepoTags)
		}
		if(containers.length) {
			await this.mergeFIX('Container', containers[0].Id, containers[0].Names[0])
		}
		if(volumes.length) {
			await this.mergeFIX('Volume', volumes[0].Name, volumes[0].Name)
		}
		if(networks.length) {
			await this.mergeFIX('Network', networks[0].Id, networks[0].Name)
		}

		const stamp = Date.now()

		for(var image of images) {

			var d = new Date(image.Created*1000);
			var tag = 'None'
			if(Array.isArray(image.RepoTags)) {
				tag = image.RepoTags[0]
			}
			var query = `MERGE (c:DockerImage {id:"${image.Id}"})
				set c.label = "${tag}",
				c._active = true,
				c.timestamp = ${stamp}
				 return c`
			await web.cypher(query)
		}
		await this.cleanByTimestamp('DockerImage', stamp)

		for(var volume of volumes) {

			var d = new Date(volume.CreatedAt*1000)
			var q = `MERGE (c:Volume {id:"${volume.Name}"})
					set c.label = "${volume.Name}",
					c._active = true,
					c.timestamp = ${stamp}
					 return c`
			await web.cypher(q)
		}
		await this.cleanByTimestamp('Volume', stamp)

		for(var network of networks) {

			var d = new Date(network.Created*1000)
			var q = `MERGE (c:Network {id:"${network.Id}"})
					set c.label = "${network.Name}",
					c._active = true,
					c.timestamp = ${stamp}
					 return c`
			await web.cypher(q)
		}
		await this.cleanByTimestamp('Network', stamp)


		for(var container of containers) {

			var q = `MATCH (i:DockerImage {id: "${container.ImageID}"})
				MERGE (c:Container {id:"${container.Id}"})-[:IS_BASED_ON]->(i)
					set c.label = "${container.Names[0]}",
					c._active = true,
					c.timestamp = ${stamp} return c`

			await web.cypher(q)
			// join networks
			var nets = []
			for(var key in container.NetworkSettings.Networks) {
				var net = container.NetworkSettings.Networks[key].NetworkID
				nets.push(networks.find(x => x.Id == net))
			}

			for(var network of nets) {
				var join = `MATCH (c:Container {
					id:"${container.Id}"}),
					(n:Network {id: "${net}"})
					MERGE (c)-[:USES_NETWORK]->(n)`
				await web.cypher(join)
			}
			// join volumes
			for(var mount of container.Mounts) {
				if(mount.Type === 'volume') {
					var volume = volumes.find(x=> x.Name == mount.Name)
					var join = `MATCH (c:Container {
						id:"${container.Id}"}),
						(n:Volume {id: "${mount.Name}"})
						MERGE (c)-[r:USES_VOLUME]->(n)
						SET r.attr = "${mount.Destination}"`
					await web.cypher(join)
				}
			}

		}
		await this.cleanByTimestamp('Container', stamp)




		// if container exist in DB, then update its status

		// if not, then create it
		//var containers_to_add = containers.map(x => x.Id )

		return 'done update'

	}


}
