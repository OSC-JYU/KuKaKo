

let chai = require('chai');
let chaiHttp = require('chai-http');
let should = chai.should();


let url = "http://localhost:8100/api";

chai.use(chaiHttp);

var vepa_1 = ''
var vepa_2 = ''
var vepa_3 = ''
var vepa_4 = ''
var vepa_5 = ''
var vepa = ''

describe('Vertices', () => {

    describe('/POST graph/vertices', () => {
		it('create vertex', (done) => {
			let person = {
				label: 'Local User',
				type: 'Person',
                id: 'local.user@jyu.fi',
                _access: 'admin'
			};
			chai.request(url)
				.post('/graph/vertices')
				.send(person)
				.end((err, res) => {
					//console.log(res.body)
					res.should.have.status(200);
					res.body.should.be.a('object');
					vepa = res.body.result[0]['@rid'];
					done();
				});
		});
	});

    describe('/POST graph/vertices', () => {
		it('create vertex', (done) => {
			let person = {
				label: 'VEPA',
				type: 'Team'
			};
			chai.request(url)
				.post('/graph/vertices')
				.send(person)
				.end((err, res) => {
					//console.log(res.body)
					res.should.have.status(200);
					res.body.should.be.a('object');
					vepa = res.body.result[0]['@rid'];
					done();
				});
		});
	});

	describe('/POST graph/vertices', () => {
		it('create vertex', (done) => {
			let person = {
				label: 'Ari Häyrinen',
				id: 'ari.hayrinen@jyu.fi',
				type: 'Person',
                _access: 'admin'
			};
			chai.request(url)
				.post('/graph/vertices')
				.send(person)
				.end((err, res) => {
					//console.log(res.body)
					res.should.have.status(200);
					res.body.should.be.a('object');
					console.log(res.body)
					vepa_1 = res.body.result[0]['@rid'];
					done();
				});
		});
	});

	describe('/POST graph/vertices', () => {
		it('create vertex', (done) => {
			let person = {
				label: 'Vellu',
				id: 'veli-matti.hakkinen@jyu.fi',
				type: 'Person'
			};
			chai.request(url)
				.post('/graph/vertices')
				.send(person)
				.end((err, res) => {
					//console.log(res.body)
					res.should.have.status(200);
					res.body.should.be.a('object');
					vepa_2 = res.body.result[0]['@rid'];
					done();
				});
		});
	});

	describe('/POST graph/vertices', () => {
		it('create vertex', (done) => {
			let person = {
				label: 'Jussi',
				id: 'jussi.t.pajari@jyu.fi',
				type: 'Person'
			};
			chai.request(url)
				.post('/graph/vertices')
				.send(person)
				.end((err, res) => {
					//console.log(res.body)
					res.should.have.status(200);
					res.body.should.be.a('object');
					vepa_3 = res.body.result[0]['@rid'];
					done();
				});
		});
	});

	describe('/POST graph/vertices', () => {
		it('create vertex', (done) => {
			let person = {
				label: 'Hannamari',
				id: 'hannamari.h.heiniluoma@jyu.fi',
				type: 'Person'
			};
			chai.request(url)
				.post('/graph/vertices')
				.send(person)
				.end((err, res) => {
					//console.log(res.body)
					res.should.have.status(200);
					res.body.should.be.a('object');
					vepa_4 = res.body.result[0]['@rid'];
					done();
				});
		});
	});

	describe('/POST graph/vertices', () => {
		it('create vertex', (done) => {
			let person = {
				label: 'Toni',
				id: 'toni.m.tourunen@jyu.fi',
				type: 'Person'
			};
			chai.request(url)
				.post('/graph/vertices')
				.send(person)
				.end((err, res) => {
					//console.log(res.body)
					res.should.have.status(200);
					res.body.should.be.a('object');
					vepa_5 = res.body.result[0]['@rid'];
					done();
				});
		});
	});

	describe('/POST graph/vertices', () => {
		it('create vertex', (done) => {
			let person = {
				label: 'JYX-julkaisuarkisto',
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
				label: 'Omeka-verkkonäyttelyt',
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
				label: 'Weskari-kaukolainapalvelu',
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
				label: 'DSpace 6',
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
				from: vepa_1,
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
				from: vepa_1,
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
				from: vepa_1,
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
		it(`create edge`, (done) => {
			let edge = {
				from: vepa_1,
				to: vepa,
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
		it(`create edge`, (done) => {
			let edge = {
				from: vepa_2,
				to: vepa,
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
		it(`create edge`, (done) => {
			let edge = {
				from: vepa_3,
				to: vepa,
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
		it(`create edge`, (done) => {
			let edge = {
				from: vepa_4,
				to: vepa,
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
		it(`create edge`, (done) => {
			let edge = {
				from: vepa_5,
				to: vepa,
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
