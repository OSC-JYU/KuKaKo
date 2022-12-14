
const sharp			= require('sharp');
const util			= require('util');
const path 			= require('path');
const stream 		= require('stream');
const fs 			= require('fs');
const fsPromises 	= require('fs').promises;

const pipeline = util.promisify(stream.pipeline);

let media = {}

media.resizeImage = async function(options, ctx) {
	if(!['image/jpeg', 'image/png'].includes(options.mimetype)) {
		// remove file from uploads dir
		try {
		  fs.unlinkSync(options.filepath)
		  //file removed
		} catch(err) {
			console.error(err)
		}
		throw('bad image type: ' + options.mimetype)
	}
	
	const resizer =
	  sharp()
		.resize(options.width, options.height)
		.png();

	resizer.options.limitInputPixels = 0

	await pipeline (
		fs.createReadStream(options.filepath),
		resizer,
		fs.createWriteStream(path.join('public', 'images', options.filename))
	)

	try {

		// remove file from uploads dir
		try {
		  fs.unlinkSync(options.filepath)
		  //file removed
		} catch(err) {
			console.error(err)
		}
	} catch(e) {
		console.log('media import failed', e)
		throw('Media import failed')
	}

}

module.exports = media
