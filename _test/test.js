

let chai = require('chai');
let chaiHttp = require('chai-http');
let should = chai.should();


let url = "http://localhost:8100/api";

chai.use(chaiHttp);

var person_1 = ''
var person_2 = ''
var system_jyx = ''
var system_omeka = ''
var system_weskari = ''
var team_1 = ''

describe('Vertices', () => {

    describe('/POST graph/vertices', () => {
		it('create vertex', (done) => {
			let person = {
				label: 'Special Team',
				type: 'Team'
			};
			chai.request(url)
				.post('/graph/vertices')
				.send(person)
				.end((err, res) => {
					//console.log(res.body)
					res.should.have.status(200);
					res.body.should.be.a('object');
					team_1 = res.body.result[0]['@rid'];
					done();
				});
		});
	});

	describe('/POST graph/vertices', () => {
		it('create vertex', (done) => {
			let person = {
				label: 'Artturimatias',
				type: 'Person',
                koira: 'musti'
			};
			chai.request(url)
				.post('/graph/vertices')
				.send(person)
				.end((err, res) => {
					//console.log(res.body)
					res.should.have.status(200);
					res.body.should.be.a('object');
					console.log(res.body)
					person_1 = res.body.result[0]['@rid'];
					done();
				});
		});
	});

	describe('/POST graph/vertices', () => {
		it('create vertex', (done) => {
			let person = {
				label: 'Patrick',
				type: 'Person'
			};
			chai.request(url)
				.post('/graph/vertices')
				.send(person)
				.end((err, res) => {
					//console.log(res.body)
					res.should.have.status(200);
					res.body.should.be.a('object');
					person_2 = res.body.result[0]['@rid'];
					done();
				});
		});
	});

	describe('/POST graph/vertices', () => {
		it('create vertex', (done) => {
			let person = {
				label: 'Some App',
				type: 'Service'
			};
			chai.request(url)
				.post('/graph/vertices')
				.send(person)
				.end((err, res) => {
					//console.log(res.body)
					res.should.have.status(200);
					res.body.should.be.a('object');
					system_jyx = res.body.result[0]['@rid'];
					done();
				});
		});
	});

	describe('/POST graph/vertices', () => {
		it('create vertex', (done) => {
			let person = {
				label: 'Interesting App',
				type: 'Service'
			};
			chai.request(url)
				.post('/graph/vertices')
				.send(person)
				.end((err, res) => {
					//console.log(res.body)
					res.should.have.status(200);
					res.body.should.be.a('object');
					system_omeka = res.body.result[0]['@rid'];
					done();
				});
		});
	});

	describe('/POST graph/vertices', () => {
		it('create vertex', (done) => {
			let person = {
				label: 'Food Ordening',
				type: 'Service'
			};
			chai.request(url)
				.post('/graph/vertices')
				.send(person)
				.end((err, res) => {
					//console.log(res.body)
					res.should.have.status(200);
					res.body.should.be.a('object');
					system_weskari = res.body.result[0]['@rid'];
					done();
				});
		});
	});

	describe('/POST graph/vertices', () => {
		it('create vertex', (done) => {
			let item = {
				label: 'DSpace',
				type: 'Application'
			};
			chai.request(url)
				.post('/graph/vertices')
				.send(item)
				.end((err, res) => {
					//console.log(res.body)
					res.should.have.status(200);
					res.body.should.be.a('object');
					system_dspace = res.body.result[0]['@rid'];
					done();
				});
		});
	});


});





describe('Edges', () => {

	describe('/POST graph/edges', () => {
		it('create vertex', (done) => {
			let edge = {
				from: person_1,
				to: system_jyx,
				relation: 'MAINTAINER_OF'

			};
			chai.request(url)
				.post('/graph/edges')
				.send(edge)
				.end((err, res) => {
					//console.log(res.body)
					res.should.have.status(200);
					res.body.should.be.a('object');

					done();
				});
		});
	});

	describe('/POST graph/edges', () => {
		it('create edge to person_1', (done) => {
			let edge = {
				from: person_1,
				to: system_omeka,
				relation: 'MAINTAINER_OF'

			};
			chai.request(url)
				.post('/graph/edges')
				.send(edge)
				.end((err, res) => {
					//console.log(res.body)
					res.should.have.status(200);
					res.body.should.be.a('object');

					done();
				});
		});
	});

	describe('/POST graph/edges', () => {
		it('create edge person', (done) => {
			let edge = {
				from: person_1,
				to: system_weskari,
				relation: 'MAINTAINER_OF'

			};
			chai.request(url)
				.post('/graph/edges')
				.send(edge)
				.end((err, res) => {
					//console.log(res.body)
					res.should.have.status(200);
					res.body.should.be.a('object');

					done();
				});
		});
	});

	describe('/POST graph/edges', () => {
		it(`create edge to ${person_1}`, (done) => {
			let edge = {
				from: person_1,
				to: team_1,
				relation: 'MEMBER_OF'

			};
			chai.request(url)
				.post('/graph/edges')
				.send(edge)
				.end((err, res) => {
					//console.log(res.body)
					res.should.have.status(200);
					res.body.should.be.a('object');

					done();
				});
		});
	});

	describe('/POST graph/edges', () => {
		it('create edge', (done) => {
			let edge = {
				from: person_2,
				to: team_1,
				relation: 'MEMBER_OF'

			};
			chai.request(url)
				.post('/graph/edges')
				.send(edge)
				.end((err, res) => {
					//console.log(res.body)
					res.should.have.status(200);
					res.body.should.be.a('object');

					done();
				});
		});
	});

	describe('/POST graph/edges', () => {
		it('create edge', (done) => {
			let edge = {
				from: system_dspace,
				to: system_jyx,
				relation: 'IS_PART_OF'

			};
			chai.request(url)
				.post('/graph/edges')
				.send(edge)
				.end((err, res) => {
					//console.log(res.body)
					res.should.have.status(200);
					res.body.should.be.a('object');

					done();
				});
		});
	});

});
