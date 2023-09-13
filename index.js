const Koa			= require('koa');
const Router		= require('koa-router');
const bodyParser	= require('koa-body');
const json			= require('koa-json')
const serve 		= require('koa-static')
const multer 		= require('@koa/multer');
const winston 		= require('winston');
const path 			= require('path')
const fs 			= require('fs')
const { Index, Document, Worker } = require("flexsearch");

const Graph 		= require('./graph.js');
const Docker 		= require('./docker.js');
const Gitlab 		= require('./gitlab.js');
const styles 		= require('./styles.js');
const schema 		= require('./schema.js');
const media 		= require('./media.js');


let graph
let docIndex

(async () => {
	console.log('initing...')
	docIndex = new Document( {
		tokenize: "full",
		document: {
			id: "id",
			index: ["label", "description", "URL"]
		}
	})
	graph = new Graph()
	try {
		await graph.initDB(docIndex)
		await graph.createIndex()
	} catch (e) {
		console.log(e)
		process.exit(1)
	}


})();


const AUTH_HEADER = 'mail'

const docker = new Docker()
const gitlab = new Gitlab()



// LOGGING
require('winston-daily-rotate-file');

var rotatedLog = new (winston.transports.DailyRotateFile)({
	filename: 'logs/kukako-%DATE%.log',
	datePattern: 'YYYY-MM',
	zippedArchive: false,
	maxSize: '20m'
});

const logger = winston.createLogger({
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.prettyPrint()
	),
	transports: [
		new winston.transports.Console(),
		rotatedLog
	]
});
logger.info('KuKaKo started');
// LOGGING ENDS

var visitors = []

var app				= new Koa();
var router			= new Router();

app.use(json({ pretty: true, param: 'pretty' }))
app.use(bodyParser());
app.use(serve(path.join(__dirname, '/public')))

const upload = multer({
	 dest: './uploads/',
	 fileSize: 1048576
 });


// check that user has rights to use app
app.use(async function handleError(context, next) {
	if(process.env.MODE == 'development') {
		if(process.env.DEV_USER) {
			context.request.headers[AUTH_HEADER] = process.env.DEV_USER // dummy shibboleth for local use	
		} else {
			context.request.headers[AUTH_HEADER] = 'local.user@localhost'
		}
	}


	if(process.env.CREATE_USERS_ON_THE_FLY == 1) {
		await next()
	} else {
		var me = await graph.myId(context.request.headers[AUTH_HEADER])
		if(!me) {
			context.status = 401
		} else {
			await next()
		}
	}
});

// catch errors in routes
app.use(async function handleError(context, next) {

	try {
		await next();
	} catch (error) {
		context.status = 500;
		var error_msg = error
		if(error.status) context.status = error.status
		if(error.message) error_msg = error.message

		logger.error({
			user:context.request.headers[AUTH_HEADER],
			message: error_msg,
			params: context.params,
			path: context.path,
			body: context.request.body,
			error: error
		});
		context.body = {'error':error_msg};

		//debug(error.stack);
	}
});

async function setDefaultResponse (ctx, next) {
    await next();

    if (!ctx.body) {
		const stream = fs.createReadStream(path.join(__dirname, '/public', 'index.html'))
		ctx.type = 'text/html; charset=utf-8'
		ctx.body = stream
    }
};

app.use(setDefaultResponse)


router.get('/api', function (ctx) {
	ctx.body = 'kukako API'
})

router.get('/api/me', async function (ctx) {
	
	if(process.env.CREATE_USERS_ON_THE_FLY = 1) {
		// keep list of visitors so that we do not create double users on sequential requests
		if(!visitors.includes(ctx.request.headers[AUTH_HEADER])) {
			visitors.push(ctx.request.headers[AUTH_HEADER])
			await graph.checkMe(ctx.request.headers[AUTH_HEADER])
		}
	}
	var me = await graph.myId(ctx.request.headers[AUTH_HEADER])
	ctx.body = {rid: me.rid, admin: me.admin, group:me.group, access:me.access, id: ctx.request.headers[AUTH_HEADER], mode:process.env.MODE ? process.env.MODE : 'production' }
})

router.get('/api/groups', async function (ctx) {
	var groups = await graph.getGroups()
	ctx.body = groups
})

router.get('/api/search', async function (ctx) {
	var result =  docIndex.search(ctx.request.query.search)
	console.log(result)
	var n = await graph.getSearchData(result)
	ctx.body = n.result
})

router.post('/api/query', async function (ctx) {
	var n = await graph.query(ctx.request.body)
	ctx.body = n
})

router.get('/api/tags', async function (ctx) {
	var n = await graph.getTags()
	ctx.body = n
})

router.get('/api/maps', async function (ctx) {
	var n = await graph.getMaps()
	ctx.body = n
})

router.get('/api/queries', async function (ctx) {
	var n = await graph.getQueries()
	ctx.body = n
})

router.get('/api/styles', async function (ctx) {
	var n = await styles.getStyle()
	ctx.body = n
})

router.post('/api/styles/import', async function (ctx) {
	var n = await styles.importStyle(ctx.request.query.filename, ctx.request.query.mode)
	ctx.body = n
})

router.post('/api/styles/export', async function (ctx) {
	var n = await styles.exportStyle(ctx.request.query.filename)
	ctx.body = n
})

router.get('/api/menus', async function (ctx) {
	var me = await graph.myId(ctx.request.headers[AUTH_HEADER])
	var n = await graph.getMenus(me.group)
	ctx.body = n
})

router.get('/api/schemas', async function (ctx) {
	var n = await schema.getSchemaTypes()
	ctx.body = n
})

router.get('/api/schemas/:schema', async function (ctx) {
	var n = await schema.getSchema(ctx.request.params.schema)
	ctx.body = n
})

router.post('/api/schemas/export', async function (ctx) {
	var n = await schema.exportSchemaYAML(ctx.request.query.filename)
	ctx.body = n
})

router.post('/api/schemas/import', async function (ctx) {
	var n = await schema.importSchemaYAML(ctx.request.query.filename, ctx.request.query.mode)
	ctx.body = n
})

router.post('/api/graph/import', async function (ctx) {
	var n = await graph.importGraphYAML(ctx.request.query.filename, ctx.request.query.mode)
	ctx.body = n
})

router.post('/api/graph/export', async function (ctx) {
	var n = await graph.exportGraphYAML(ctx.request.query.filename, ctx.request.query.mode)
	ctx.body = n
})

router.get('/api/graph/stats', async function (ctx) {
	var n = await graph.getStats()
	ctx.body = n
})

router.post('/api/graph/query/me', async function (ctx) {
	var n = await graph.myGraph(user, ctx.request.body)
	ctx.body = n
})

router.post('/api/graph/query', async function (ctx) {
	var n = await graph.getGraph(ctx.request.body, ctx)
	ctx.body = n
})

router.post('/api/graph/vertices', async function (ctx) {
	var type = ctx.request.body.type
	var n = await graph.create(type, ctx.request.body)
	var node = n.result[0]
	docIndex.add({id: node['@rid'],label:node.label})
	ctx.body = n
})


router.delete('/api/graph/vertices/:rid', async function (ctx) {
	var n = await graph.deleteNode(ctx.request.params.rid)
	docIndex.remove('#' + ctx.request.params.rid)
	ctx.body = n
})


router.get('/api/graph/vertices/:rid', async function (ctx) {
	var n = await graph.getDataWithSchema(ctx.request.params.rid)
	ctx.body = n
})

router.post('/api/graph/vertices/:rid', async function (ctx) {
	var n = await graph.setNodeAttribute('#' + ctx.request.params.rid, ctx.request.body)
	var a = await graph.getNodeAttributes(ctx.request.params.rid)
	if(a.result) {
		a.result[0].id = a.result[0]['@rid']
		docIndex.update(a.result[0])
	}

	ctx.body = n
})

router.post('/api/graph/edges', async function (ctx) {
	var n = await graph.connect(
		ctx.request.body.from,
		ctx.request.body.relation,
		ctx.request.body.to)
	ctx.body = n
})

router.delete('/api/graph/edges/:rid', async function (ctx) {
	var n = await graph.deleteEdge('#' + ctx.request.params.rid)
	ctx.body = n
})

router.post('/api/graph/edges/:rid', async function (ctx) {
	var n = await graph.setEdgeAttribute('#' + ctx.request.params.rid, ctx.request.body)
	ctx.body = n
})

router.post('/api/graph/edges/connect/me', async function (ctx) {
	var me = await graph.myId(user)
	ctx.request.body.from = me
	var n = await graph.connect(ctx.request.body)
	ctx.body = n
})

router.post('/api/graph/edges/unconnect/me', async function (ctx) {
	var me = await graph.myId(user)
	ctx.request.body.from = me
	var n = await graph.unconnect(ctx.request.body)
	ctx.body = n
})

router.post('/api/layouts', async function (ctx) {
	var me = await graph.myId(ctx.request.headers[AUTH_HEADER])
	var n = await graph.setLayout(ctx.request.body, me)
	ctx.body = n
})

router.get('/api/layouts/:rid', async function (ctx) {
	var me = await graph.myId(ctx.request.headers[AUTH_HEADER])
	var n = await graph.getLayoutByTarget(ctx.request.params.rid, me)
	ctx.body = n
})

router.get('/api/stories/:rid', async function (ctx) {
	var n = await graph.getStory(ctx.request.params.rid)
	ctx.body = n
})

router.get('/api/documents', async function (ctx) {
	var n = await graph.getListByType(ctx.request.query)
	ctx.body = n
})

router.get('/api/documents/:rid', async function (ctx) {
	var n = await graph.getNodeAttributes(ctx.request.params.rid)
	ctx.body = n
})

router.get('/api/files/:dir', async function (ctx) {
	var n = await graph.getFileList(ctx.request.params.dir)
	ctx.body = n
})

router.get('/api/docker/containers', async function (ctx) {
	var n = await docker.getContainers()
	ctx.body = n
})

router.get('/api/docker/containers/:id/top', async function (ctx) {
	var n = await docker.getContainerTop(ctx.request.params.id)
	ctx.body = n
})

router.get('/api/docker/containers/:id/inspect', async function (ctx) {
	var n = await docker.getContainerInspect(ctx.request.params.id)
	ctx.body = n
})

router.get('/api/docker/containers/:id/logs', async function (ctx) {
	var n = await docker.getContainerLogs(ctx.request.params.id)
	ctx.body = n
})

router.get('/api/docker/images', async function (ctx) {
	var n = await docker.getImages()
	ctx.body = n
})

router.get('/api/docker/volumes', async function (ctx) {
	var n = await docker.getVolumes()
	ctx.body = n
})

router.get('/api/docker/networks', async function (ctx) {
	var n = await docker.getNetworks()
	ctx.body = n
})

router.get('/api/docker/update', async function (ctx) {
	var n = await docker.update()
	ctx.body = n
})

router.get('/api/gitlab/repositories', async function (ctx) {
	var n = await gitlab.getRepositories()
	ctx.body = n
})

router.get('/api/gitlab/repositories/:id/commits', async function (ctx) {
	var n = await gitlab.getCommits(ctx.request.params.id)
	ctx.body = n
})

router.get('/api/gitlab/update', async function (ctx) {
	var n = await gitlab.update()
	//var n = await gitlab.updateBaseImages()
	//var n = await gitlab.linkToDockerImages()
	//var n = await gitlab.updateProgrammingLanguages()
	ctx.body = n
})

router.post('/api/upload/:rid', upload.single('image'), async function (ctx)  {
	if(!ctx.request.params.rid) throw('Upload needs node RID!')

	var options = {
		filepath: ctx.file.path,
		mimetype: ctx.file.mimetype,
		filename: ctx.request.params.rid.replace('#','') + '.png',
		width: 200,
		height: 200
	}

	media.resizeImage(options)
    ctx.body = 'done';
})

router.post('/api/graph/upload', upload.single('file'), async function (ctx)  {

	var filepath = `graph/${ctx.file.originalname}`
	var exists = await checkFileExists(filepath)
	if(!exists) {
		await fs.promises.rename(ctx.file.path, filepath);
		console.log('File moved successfully!')
		ctx.body = 'done';
	} else {
		await fs.promises.unlink(ctx.file.path)
		throw('file exists!')
	}
})


router.post('/api/schema/upload', upload.single('file'), async function (ctx)  {

	var filepath = `schemas/${ctx.file.originalname}`
	await moveFile(ctx.file.path, filepath, ctx)

})

router.post('/api/styles/upload', upload.single('file'), async function (ctx)  {

	var filepath = `styles/${ctx.file.originalname}`
	await moveFile(ctx.file.path, filepath, ctx)
})



app.use(router.routes());

async function moveFile(file, target_path, ctx) {
	var exists = await checkFileExists(target_path)
	if(!exists) {
		await fs.promises.rename(file, target_path);
		console.log('File moved successfully!')
		ctx.body = 'done';
	} else {
		await fs.promises.unlink(ctx.file.path)
		throw('file exists!')
	}
}

async function checkFileExists(filePath) {
	try {
		console.log(filePath)
	  await fs.access(filePath);
	  return true;
	} catch (err) {
	  return false;
	}
  }


var set_port = process.env.PORT || 8100
var server = app.listen(set_port, function () {
   var host = server.address().address
   var port = server.address().port

   console.log('KuKaKo running at http://%s:%s', host, port)
})
