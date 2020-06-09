const request = require('supertest')
const server = require('../server.js')
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

async function make_clean() {
    //start server with testing turned on in a test dir
    await rmdir('testdir')
    await mkdir('testdir')
    await mkdir('testdir/data')
    await mkdir('testdir/meta')
}

async function login_as_user(app,user1) {
    return await request(app).post(`/auth/test/${user1}`)
        .expect('Content-Type', /json/)
        .expect(200)
        .then(res => {
            console.log("tried to log in",res.body)
            assert(res.body['access-key'])
            return res.body['access-key']
        })
}

async function upload_doc_obj(app, user, accessKey, params, data_obj) {
    let query = Object.keys(params).map(key => {
        let value = params[key]
        value = value.replace(/ /g,'%20')
        return `${key}=${value}`
    }).join("&")
    return await request(app)
        .post(`/docs/${user}/upload/?${query}`)
        .set('access-key',accessKey)
        .send(data_obj)
        .expect('Content-Type', /json/)
        .expect(200)
}

async function get_info_by_id(app, user, accessKey, docid) {
    //check json metadata is correct
    return await request(app).get(`/docs/${user}/info/${docid}/latest/`)
        .set('access-key',accessKey)
        .expect('Content-Type', /json/)
        .expect(200)
}

async function doit() {
    await make_clean()
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
    let accessKey = await login_as_user(app,'user1')
    console.log(`using the user1 login key of '${accessKey}'`)

    //list docs. should be empty
    let docs = await fetch_all_docs(app, 'user1', accessKey)
    assert(docs.length === 0)
    pass("empty query test")

    let res = null;

    //create JSON doc payload and upload
    res = await upload_doc_obj(app,'user1',accessKey,
        {type:'json',title:'my json doc'},
        {foo:'bar'}
        )
    console.log("return is",res.body)
    assert(res.body.doc.type === 'json')
    assert(res.body.doc.title === 'my json doc')
    pass("make doc test")

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
    let json_doc = await get_doc_by_id(app, 'user1', accessKey, docid)
    assert(json_doc.body.foo === 'bar')
    pass("verify data test")

    // modify json doc payload and upload. should create a new version.
    // old version is deleted. existing metadata is the same
    res = await upload_doc_obj(app, 'user1',accessKey,
        {id:docid,title:'newtitle'},{foo:'baz'})
    assert(res.body.doc.title === 'newtitle')
    pass("make doc test")

    //check json doc payload is correct
    json_doc = await get_doc_by_id(app, 'user1', accessKey, docid)
    assert(json_doc.body.foo === 'baz')
    pass("verify data update test")

    let info = await get_info_by_id(app, 'user1', accessKey, docid)
    assert(info.body.doc.title === 'newtitle')
    assert(info.body.doc._id === docid)
    assert(info.body.doc.type === 'json')
    pass("verify metadata test")


    //create png and upload
    await request(app).post(`/docs/user1/upload/?&title=testpng&filename=test.png&mimetype=image/png`)
        .set('access-key',accessKey)
        .attach('file','./tests/test.png')
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


    //login as a different user
    //login with test account, user 1
    accessKey = await request(app).post(`/auth/test/user2`)
        .expect('Content-Type', /json/)
        .expect(200)
        .then(res => {
            console.log("tried to log in",res.body)
            assert(res.body['access-key'])
            return res.body['access-key']
        })

    console.log(`using the user2 login key of '${accessKey}'`)

    //list docs. should not have any user1 docs so should be empty
    await request(app).get(`/docs/user2/search?`)
        .set('access-key',accessKey)
        .expect('Content-Type', /json/)
        .expect(200)
        .then(res => {
            console.log("the res is",res.body)
            assert(res.body.success===true)
            assert(res.body.results.length === 0)
        })
        .then(()=>pass("empty query test"))
//download png with an alternative name
//download png with an alternative mimetype
//download png with an alternative extension


//test that i can access a file when i'm not logged in
//test that i can't create a file when i'm not logged in


}

async function fetch_all_docs(app, user1, accessKey) {
    return await request(app).get(`/docs/${user1}/search?`)
        .set('access-key',accessKey)
        .expect('Content-Type', /json/)
        .expect(200)
        .then(res => {
            assert(res.body.success===true)
            return res.body.results
        })
}

async function get_doc_by_id(app, user, accessKey, docid) {
    return await request(app).get(`/docs/${user}/data/${docid}/latest/application/json/data.json`)
        .set('access-key',accessKey)
        .expect('Content-Type', /json/)
        .expect(200)
}

async function test_thumbnails() {
    await make_clean()

    // start with standard user1
    const app = server.startServer({
        DIR:"testdir",
        TEST_AUTH: true,
        USERS:['user1'],
        PORT:3000
    })

    // login as user1
    let accessKey = await login_as_user(app,'user1')
    console.log(`using the user1 login key of '${accessKey}'`)

    // get list of docs, assert it is empty
    let docs = await fetch_all_docs(app, 'user1', accessKey)
    assert(docs.length === 0)

    // upload a doc
    let res = await upload_doc_obj(app, 'user1', accessKey,
        {type:'json',title:'my_json'},
        {foo:'bar'})
    let docid = res.body.doc._id
    console.log("docid ",docid)

    // fetch the doc info, confirm no thumbnails
    res = await get_info_by_id(app, 'user1', accessKey, docid)
    assert(res.thumbnails === undefined)
    console.log("info is",res.body)

    // attach a thumbnail to the doc
    // await upload_thumbnail(app, 'user1', accessKey, 'tests/thumb1.png')
    res = await upload_doc_file(app, 'user1',accessKey, {}, 'tests/thumb1.png')


    // fetch the doc info, confirm one thumbnail
    // attach a second thumbnail (same, but different size)
    // fetch the doc info, confirm two thumbnails w/ correct data
    // update first thumbnail
    // fetch the doc info, confirm updated
    // fetch thumbnail from doc info, confirm it is valid
}

// doit().then(()=>{
//     console.log("done with the tests")
//     process.exit(0)
// })
test_thumbnails().then(()=>{
    console.log("done with the tests")
    process.exit(0)
})


