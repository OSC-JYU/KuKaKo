const fsPromises = require('fs/promises')
const path = require('path')

const schema = require("./schema.js")
const web = require("./web.js")


console.log('Converting layouts to JSON files...')

async function convert() {
	var response = await web.cypher('MATCH (l:Layout) RETURN l')
	console.log(response.result)
	for(row of response.result) {
		var positions = {}
		if(typeof row.positions != 'string') {
			for(pos in row.positions) {
				console.log(pos)
				var node = pos.replace('node','#').replace('_', ':')
				console.log(node)
				positions[node] = row.positions[pos]
			}
		}
		console.log(positions)
		filename = `layout_${row.target}-${row.user}.json`
		const filePath = path.resolve('./layouts', filename)
		console.log(filename)
		await fsPromises.writeFile(filePath, JSON.stringify(positions), 'utf8')
	}

}


convert()