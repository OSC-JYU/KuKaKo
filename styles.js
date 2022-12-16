const path = require('path')
const fsPromises = require('fs/promises')
const web = require("./web.js")


let styles = {}


// default style for every node and relationship
const basestyle = [
	{
        "selector": "node",
        "style": {
            "background-color": "#1C86AA",
            "shape": "roundrectangle",
            "height": 20,
            "font-size": 8,
            "width": 100,
            "color": "white",
            "text-wrap": "wrap",
            "text-valign": "center",
            "text-halign": "center",
			"content":  "(node) => node.data('name') + '\\n ('+node.data('type_label')+')'",
			"border-color": "(node) => node.data('current') ? '#EDA60C' : 'gray'",
			"border-width": "(node) => node.data('current') ? 3 : 1",
			"opacity": "(node) => node.data('active') ? 1 : 0.3"
		}
    },

    {
        "selector": "edge",
        "style": {
            "label": "data(label)",
            "curve-style": "bezier",
            "control-point-distance": 30,
            "control-point-weight": 0.5,
            "overlay-padding": "3px",
            "overlay-opacity": 0,
            "font-family": "FreeSet,Arial,sans-serif",
            "font-size": 4,
            "font-weight": "normal",
            "text-background-opacity": 1,
            "text-background-color": "#ffffff",
            "text-background-padding": 3,
            "text-background-shape": "roundrectangle",
			"width": "(node) => node.data('active') ? 1 : 0.5",
			"font-size": "(node) => node.data('active') ? 6 : 4",
			"color": "(node) => node.data('active') ? 'black' : 'gray'",
			"line-opacity": "(node) => node.data('active') ? 1 : 0.3",
			"curve-style": "(node) => node.data('active') ? 'bezier' : 'taxi'",
            "target-arrow-shape": "triangle"
        }
    }
]



styles.importStyle = async function(filename, mode) {
	console.log(`** IMPORTING STYLE ${filename} mode: ${mode} **`)
	if(!filename) throw('You need to give a file name! ')
	const filePath = path.resolve(__dirname, 'styles', filename)
	const data = await fsPromises.readFile(filePath, 'utf8')
	var styles = JSON.parse(data)

	if(mode == 'clear') {
		var query = `MATCH (s:Schema) SET s._style = ''`
		await web.cypher( query)
	}

	for(style of styles) {
		if(style.selector.startsWith('node[type=')) {
			var selector = style.selector.replace('node[type=', '')
			selector = selector.replace(/[\"|\'|\]]/g,'')
			var style_str = JSON.stringify(style.style)
			style_str = style_str.replace(/\'/g, '##')
			try {
				var query = `MATCH (s:Schema {_type:"${selector}"}) SET s._style = '${style_str}'`
				await web.cypher( query)
			} catch (e) {
				console.log(`\nWARNING: invalid style for Schema ${selector}\n`)
				console.log(style.style)
				var query = `MATCH (s:Schema {_type:"${selector}"}) SET s._style = '{}'`
				await web.cypher( query)
			}
		}
	}
	console.log('** IMPORT DONE **')
    return styles
}



styles.exportStyle = async function(filename) {
	if(!filename) throw('You need to give a file name! ')
	const filePath = path.resolve(__dirname, 'styles', filename)
	const style = await this.getStyle()
	const data = await fsPromises.writeFile(filePath, JSON.stringify(style, null, 2), 'utf8')
	return

}



styles.getStyle = async function() {

	var styles = [...basestyle] // deep copy

	const query = "MATCH (s:Schema) return s._type as type, s._style as style"
	var response = await web.cypher( query)
	for(var schema of response.result) {
		if(schema.style && schema.style !== '  cypher.null') {
			try {
				var style = JSON.parse(schema.style)
				styles.push(
					{
						selector:`node[type='${schema.type}']`,
						style: style
				})

			} catch(e) {
				console.log(`WARNING: invalid style for ${schema.type}`)
			}
		}
	}
	return styles
}

module.exports = styles
