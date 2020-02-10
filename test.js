const request = require('supertest')
const server = require('./server')
const assert = require('assert')
const fs = require('fs')
const path = require('path')

function mkdir(fname) {
    return new Promise((res,rej)=>{
        fs.exists(fname,(exists)=> {
            if(exists) return res()
            fs.mkdir(fname, (err, ans) => {
                if (err) return rej(err)
                res()
            })
        })
    })
}

async function rmdir(dir) {
    try {
        const info = await fs.promises.stat(dir)
        if (info.isDirectory()) {
            const list = await fs.promises.readdir(dir)
            if (list.length === 0) {
                console.log(`deleting ${dir}`)
                return fs.promises.rmdir(dir)
            } else {
                const proms = list.map(name => rmdir(path.join(dir, name)))
                return Promise.all(proms)
            }
        }

        console.log(`deleting ${dir}`)
        await fs.promises.unlink(dir)
    } catch (e) {
        console.log("error deleting. ignore",e)
    }
}
function pass(msg) {
    console.log("   PASSED:",msg)
}

async function doit() {

    //start server with testing turned on in a test dir
    await rmdir('testdir')
    await mkdir('testdir')
    await mkdir('testdir/data')
    await mkdir('testdir/meta')
    const app = server.startServer({
        DIR:"testdir",
        TEST_AUTH: true,
        USERS:['user1'],
        PORT:3000
    })

    //get server info. proves we can connect
    // await request(app).get('/info')
    //     .expect('Content-Type', /json/)
    //     .expect(200)
    //     .then(res => {
    //         assert(res.body.authentication, 'auth is not-supported')
    //     })

    //login with test account, user 1
    const accessKey = await request(app).post(`/auth/test/user1`)
        .expect('Content-Type', /json/)
        .expect(200)
        .then(res => {
            console.log("tried to log in",res.body)
            assert(res.body['access-key'])
            return res.body['access-key']
        })

    console.log(`using the user1 login key of '${accessKey}'`)

    //list docs. should be empty
    await request(app).get(`/docs/user1/search?`)
        .set('access-key',accessKey)
        .expect('Content-Type', /json/)
        .expect(200)
        .then(res => {
            assert(res.body.success===true)
            assert(res.body.results.length === 0)
        })
        .then(()=>pass("empty query test"))




    //create JSON doc payload and upload
    await request(app)
        .post(`/docs/user1/upload/?type=json&title=my%20json%20doc`)
        .set('access-key',accessKey)
        .send({foo:"bar"})
        .expect('Content-Type', /json/)
        .expect(200)
        .then(res => {
            console.log("return is",res.body)
            assert(res.body.doc.type === 'json')
            assert(res.body.doc.title === 'my json doc')
        })
        .then(()=>pass("make doc test"))

    function search(queryString) {
        return request(app)
            .get(`/docs/user1/search?${queryString}`)
            .set('access-key',accessKey)
            .expect('Content-Type', /json/)
            .expect(200)
            .then(res =>{
                assert(res.body.success===true)
                return res
            })

    }

    //list all docs, should include a json doc w/ new id
    await search('').then(res => {
            assert(res.body.results.length === 1)
            assert(res.body.results.filter(d => d.type==='json').length === 1)
        }).then(()=>pass("all doc search test"))

    //list all docs by type of json doc
    await search('type=json').then(res => {
            assert(res.body.results.length === 1)
            assert(res.body.results.filter(d => d.type==='json').length === 1)
        }).then(()=>pass("type json search test"))

    //list all docs by type of png doc, should be empty
    await search('type=png').then(res => {
            assert(res.body.results.length === 0)
        }).then(()=>pass("type png search test"))

    //list all docs by mime-type of application/json
    await search(`mimetype=application/json`).then(res => {
            assert(res.body.results.length === 1)
            assert(res.body.results.filter(d => d.type==='json').length === 1)
        }).then(()=>pass("mimetype search test"))


    //list all docs by extension .json
    let docid = 0
    await search('extension=json').then(res => {
            assert(res.body.results.length === 1)
            const docs = res.body.results.filter(d => d.type==='json')
            assert(docs.length === 1)
            const doc = docs[0]
            docid = doc._id
        }).then(()=>pass("extension search test"))


    console.log("using the docid",docid)
    //verify payload of json doc
    await request(app).get(`/docs/user1/data/${docid}/latest/application/json/data.json`)
        .set('access-key',accessKey)
        .expect('Content-Type', /json/)
        .expect(200)
        .then(res => {
            assert(res.body.foo === 'bar')
        })
        .then(()=>pass("verify data test"))


    //modify json doc payload and upload. should create a new version. old version is deleted. existing metadata is the same
    await request(app).post(`/docs/user1/upload/?id=${docid}&title=newtitle`)
        .set('access-key',accessKey)
        .send({foo:"baz"})
        .expect('Content-Type', /json/)
        .expect(200)
        .then(res => {
            assert(res.body.doc.title === 'newtitle')
        })
        .then(()=>pass("make doc test"))

    //check json doc payload is correct
    await request(app).get(`/docs/user1/data/${docid}/latest/application/json/data.json`)
        .set('access-key',accessKey)
        .expect('Content-Type', /json/)
        .expect(200)
        .then(res => {
            console.log("new body",res.body)
            assert(res.body.foo === 'baz')
        })
        .then(()=>pass("verify data update test"))

    //check json metadata is correct
    await request(app).get(`/docs/user1/info/${docid}/latest/`)
        .set('access-key',accessKey)
        .expect('Content-Type', /json/)
        .expect(200)
        .then(res => {
            assert(res.body.doc.title === 'newtitle')
            assert(res.body.doc._id === docid)
            assert(res.body.doc.type === 'json')
        })
        .then(()=>pass("verify metadata test"))


    //create png and upload
    await request(app).post(`/docs/user1/upload/?&title=testpng&filename=test.png&mimetype=image/png`)
        .set('access-key',accessKey)
        .attach('file','./test.png')
        .expect('Content-Type', /json/)
        .expect(200)
        .then(res => {
            assert(res.body.doc.title === 'testpng')
            assert(res.body.doc.filename === 'test.png')
        })
        .then(()=>pass("make doc test"))

    //list all docs, should list png
    await search("mimetype=image/png").then(res => {
        console.log("results is",res.body)
        assert(res.body.results.length === 1)
        assert(res.body.results.filter(d => d.mimetype==='image/png').length === 1)
    }).then(()=>pass("mimetype search test"))

    //list all jpg, should not list png
    await search("mimetype=image/jpeg").then(res => {
        console.log("results is",res.body)
        assert(res.body.results.length === 0)
        assert(res.body.results.filter(d => d.mimetype==='image/png').length === 0)
    }).then(()=>pass("mimetype search test"))

//download png with an alternative name
//download png with an alternative mimetype
//download png with an alternative extension


//test that i can access a file when i'm not logged in
//test that i can't create a file when i'm not logged in


}


doit().then(()=>{
    console.log("done with the tests")
})


