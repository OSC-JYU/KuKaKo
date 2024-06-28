
const web = require("./web.js")


let user = {}

user.hasAdminPermissions = async function(auth_header) {
	var me = await this.myId(auth_header)
	if(me.access === 'admin') {
		return true
	}
	return false
}


user.hasCreatePermissions = async function(type_data, auth_header) {
	var me = await this.myId(auth_header)
	if(me.access === 'admin') {
		return true
	} else if(me.access === 'creator' && type_data.label !== 'Nodes') {
		return true
	} else if(me.access === 'user' && type_data._public) {
		return true
	}
	return false
}


user.hasDeletePermissions = async function(auth_header) {
	var me = await this.myId(auth_header)
	if(me.access === 'admin') {
		return true
	} else return false
}


user.hasConnectPermissions = async function(from, to, auth_header) {
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


user.hasNodeAttributePermissions = async function(node_rid, auth_header) {
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


user.hasEdgeAttributePermissions = async function(from, to, auth_header) {
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
	
	
user.myId = async function(user) {
	if(!user) throw('user not defined')
	var query = `MATCH (me:Person {id:"${user}"}) return id(me) as rid, me._group as group, me._access as access`
	var response = await web.cypher(query)
	if(!response.result) throw('user not found!')
	return response.result[0]
}

	
user.checkHastag = function(rid) {
	if(!rid.match(/^#/)) rid = '#' + rid
	return rid
}


module.exports = user
