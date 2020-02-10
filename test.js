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
            assert(res.body.doc.type === 'test')
            assert(res.body.doc.title === 'my json doc')
        })
        .then(()=>pass("make doc test"))
    //list all docs, should include a json doc w/ new id
    await request(app).get(`/user1/search?`)
        .set('access-key',accessKey)
        .expect('Content-Type', /json/)
        .expect(200)
        .then(res => {
            assert(res.body.success===true)
            assert(res.body.results.length === 1)
            assert(res.body.results.filter(d => d.type==='json').length === 0)
        })
        .then(()=>pass("all doc search test"))
    //list all docs by type of json doc
    await request(app).get(`/user1/search?type=json`)
        .set('access-key',accessKey)
        .expect('Content-Type', /json/)
        .expect(200)
        .then(res => {
            assert(res.body.success===true)
            assert(res.body.results.length === 1)
            assert(res.body.results.filter(d => d.type==='json').length === 1)
        })
        .then(()=>pass("type search test"))
    //list all docs by mime-type of application/json
    await request(app).get(`/user1/search?mimetype=application/json`)
        .set('access-key',accessKey)
        .expect('Content-Type', /json/)
        .expect(200)
        .then(res => {
            assert(res.body.success===true)
            assert(res.body.results.length === 1)
            assert(res.body.results.filter(d => d.type==='json').length === 1)
        })
        .then(()=>pass("mimetype search test"))


    //list all docs by extension .json
    let docid = 0
    await request(app).get(`/user1/search?extension=.json`)
        .set('access-key',accessKey)
        .expect('Content-Type', /json/)
        .expect(200)
        .then(res => {
            assert(res.body.success===true)
            assert(res.body.results.length === 1)
            const docs = res.body.results.filter(d => d.type==='json')
            assert(docs.length === 1)
            const doc = docs[0]
            docid = doc.id
        })
        .then(()=>pass("extension search test"))

    //verify payload of json doc
    await request(app).get(`/user1/data/${docid}/latest/application/json/data.json`)
        .set('access-key',accessKey)
        .expect('Content-Type', /json/)
        .expect(200)
        .then(res => {
            assert(res.foo === 'bar')
        })
        .then(()=>pass("verify data teset"))


    //modify json doc payload and upload. should create a new version. old version is deleted. existing metadata is the same
    await request(app).post(`/user1/upload/?id=${docid}&title=newtitle`)
        .set('access-key',accessKey)
        .send({foo:"baz"})
        .expect('Content-Type', /json/)
        .expect(200)
        .then(res => {
            assert(res.body.doc.title === 'newtitle')
        })
        .then(()=>pass("make doc test"))
    //check json doc payload is correct
    await request(app).get(`/user1/data/${docid}/latest/application/json/data.json`)
        .set('access-key',accessKey)
        .expect('Content-Type', /json/)
        .expect(200)
        .then(res => {
            assert(res.foo === 'baz')
        })
        .then(()=>pass("verify data update test"))

    //check json metadata is correct
    await request(app).get(`/user1/info/${docid}/latest/application/json/data.json`)
        .set('access-key',accessKey)
        .expect('Content-Type', /json/)
        .expect(200)
        .then(res => {
            assert(res.body.doc.title === 'newtitle')
            assert(res.body.doc.id === docid)
            assert(res.body.doc.type === 'json')
        })
        .then(()=>pass("verify metadata test"))


    //create png and upload
    await request(app).post(`/user1/upload/?&title=testpng&filename=test.png&mimetype=image/png`)
        .set('access-key',accessKey)
        .sendFile("./test.png")
        .expect('Content-Type', /json/)
        .expect(200)
        .then(res => {
            assert(res.body.doc.title === 'testpng')
            assert(res.body.doc.filename === 'test.png')
        })
        .then(()=>pass("make doc test"))

//list all docs, should list png
//list all png, should list png
//list all jpg, should not list png

//download png with an alternative name
//download png with an alternative mimetype
//download png with an alternative extension


//test that i can access a file when i'm not logged in
//test that i can't create a file when i'm not logged in


}


doit().then(()=>{
    console.log("done with the tests")
})


