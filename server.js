const express = require('express')
const fs = require('fs')
const bodyParser = require('body-parser')
const passport = require('passport')
const path = require('path')
const NEDB = require('nedb')
const session = require('express-session');
const GithubStrategy = require('passport-github')
const formidable = require('formidable')
const cors = require('cors');


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

function startServer(options) {
    const DB_FILE = path.join(options.DIR,'database.db')
    const DB = new NEDB({filename: DB_FILE, autoload:true})

    async function saveThumbnail(username, params, file) {
        // console.log("saving ", username, params, file)
        const fid = "thumbnail" + Math.floor(Math.random() * 10 * 1000 * 1000)
        const fpath = path.join(options.DIR, 'thumbnails', username, fid)
        // console.log("making")
        await mkdir(path.join(options.DIR, 'thumbnails'))
        await mkdir(path.join(options.DIR, 'thumbnails', username))
        // console.log("writing thumbnail to disk as", fpath)
        await fs.promises.rename(file.path, fpath)
        console.log("done saving thumbnail")

        // console.log("updating metadata")
        return new Promise((res, rej) => {
            DB.update(
                //query
                {
                    _id: params.docid,
                    username: params.username
                },
                //fields to update
                {
                    $push: {
                        thumbnails:[
                            {
                                width:parseInt(params.width),
                                height:parseInt(params.height),
                                mimetype:`${params.mtype}/${params.msubtype}`,
                                src:`docs/${username}/thumbnail/${params.docid}/version/${params.mtype}/${params.msubtype}/${params.width}/${params.height}/thumbnail.jpg`,
                            }
                        ]
                    }
                },
                {returnUpdatedDocs: true},//options
                (err, num, doc) => {
                    if (err) return rej(err)
                    console.log("the updated doc is", doc)
                    return res(doc)
                })
        })
    }


    function saveDoc(username, query, body, file) {
        return new Promise((res,rej)=>{
            console.log("saving the doc",body,'using query',query,'username',username)

            const fid = "data"+Math.floor(Math.random()*10*1000*1000)
            const fpath = path.join(options.DIR,'data',username,fid)
            const fdir = path.join(options.DIR,'data',username)
            const fdir0 = path.join(options.DIR,'data')



            console.log("writing to disk as",fpath)
            let data = JSON.stringify(body)
            mkdir(fdir0)
                .then(()=> mkdir(fdir))
                .then(()=>{
                if(file) {
                    console.log("uploading a file, actually",file)
                    const fname = query.filename?query.filename:file.name
                    const extension = fname.substring(fname.lastIndexOf('.')+1)
                    const meta = {
                        username:username,
                        type: query.type ? query.type : 'unknown',
                        title: query.title ? query.title : 'untitled',
                        filename: query.filename ? query.filename : file.name,
                        mimetype: query.mimetype ? query.mimetype : file.type,
                        extension:extension,
                        datapath: fpath,
                    }
                    console.log("file meta is",meta)
                    fs.rename(file.path,fpath,(err)=> {
                        if (err) return rej(err)
                        DB.insert(meta, (err, newDoc) => {
                            if (err) return rej(err)
                            console.log("the new doc is", newDoc)
                            return res(newDoc)
                        })
                    })
                    return
                }
                fs.writeFile(fpath,data,(err)=>{
                    if(err) return rej(err)
                    if(query.id) {
                        console.log("updating instead of creating")
                        const meta = {
                            $set: {
                                username: username,
                                datapath: fpath,
                            }
                        }
                        if(query.type) meta.$set.type = query.type
                        if(query.title) meta.$set.title = query.title
                        console.log("updating fields",meta)
                        DB.update(
                            {_id:query.id,username:username},//query
                            meta, //fields
                            {returnUpdatedDocs:true},//options
                            (err,num,doc)=>{
                            if (err) return rej(err)
                                console.log("hte updated doc is",doc)
                            return res(doc)
                        })
                    } else {
                        const meta = {
                            username:username,
                            type: query.type ? query.type : 'unknown',
                            title: query.title ? query.title : 'untitled',
                            mimetype: 'application/json',
                            extension: 'json',
                            datapath: fpath
                        }
                        DB.insert(meta, (err, newDoc) => {
                            if (err) return rej(err)
                            console.log("the new doc is", newDoc)
                            return res(newDoc)
                        })
                    }
                })
            })
        })
    }

    function findDoc(username, query) {
        return new Promise((res,rej)=>{
            DB.find(query,(err,docs)=>{
                if(err) return rej(err)
                return res(docs)
            })
        })
    }

    function deleteDocs(username, query) {
        query.username = username
        return new Promise((res,rej) => {
            DB.remove(query, {multi:true}, (err, count) => {
                if (err) return rej(err)
                console.log("deleted docs",count)
                return res(count)
            })
        })
    }

    function loadDoc(username, id) {
        return new Promise((res,rej)=>{
            DB.find({_id:id}, (err,docs)=>{
                if(err) return rej(err)
                if(docs.length !== 1) return rej({message:'doc not found'})
                return res(docs[0])
            })
        })
    }

    // let options = setupOptions()
    const app = express()
    app.use(bodyParser.json({limit:'20MB'}))
    app.use(bodyParser.urlencoded())
    app.use(cors())

    const USERS = {}

    if(options.AUTH_ENABLED) {
        passport.use(new GithubStrategy({
            clientID: options.GITHUB_CLIENT_ID,
            clientSecret: options.GITHUB_CLIENT_SECRET,
            callbackURL: options.GITHUB_CALLBACK_URL
        }, function (accessToken, refreshToken, profile, done) {
            console.log("github strategy callback", accessToken)
            if (options.ALLOWED_USERS.indexOf(profile.username) < 0) return console.log(`username ${profile.username} not in allowed users`)
            USERS[accessToken] = profile
            done(null, {username: profile.username, accessToken: accessToken})
        }))

        passport.serializeUser((user, cb) => cb(null, user))
        passport.deserializeUser((obj, cb) => cb(null, obj))

        app.use(require('cookie-parser')());
        app.use(require('express-session')({secret: 'keyboard cat', resave: true, saveUninitialized: true}));
        app.use(passport.initialize())
        app.use(passport.session())
    }

    function authTemplate(req) {
        return `<html>
        <body>
            <p>great. you are authenticated. you may close this window now.</p>
            <script>
                document.body.onload = function() {
                    const injectedUser = ${JSON.stringify(req.user)}
                    console.log("the user is",injectedUser)
                    const msg = {payload:injectedUser, status:'success'}
                    console.log("msg",msg)
                    console.log('location',window.opener.location,'*')
                    window.opener.postMessage(msg, '*')
                    console.log("done posting a message")
                }
        </script>
        </body>
        </html>`
    }

    app.get('/',(req,res)=>{
        res.send("this is the index page")
    })

    function generateTestingLogin(username) {
        const token = `token-${Math.floor(Math.random()*100000)}`
        USERS[token] = {
            username:username
        }
        return token
    }

    const allowed = (req,res,done) => {
        if(options.TEST_AUTH) {
            const token = req.headers['access-key']
            req.user = USERS[token]
        }
        if(!options.AUTH_ENABLED) return done()
        const token = req.headers['access-key']
        const user = USERS[token]
        if(!user) return res.json({success:false,message:'invalid access token, cannot find user'})
        console.log("the user is",user.username)
        req.user = user
        console.log("verifying the user",req.user)
        if(!req.user) return res.status(400).json({status:'error',message:'not logged in'})
        if(options.ALLOWED_USERS.indexOf(req.user.username)<0) {
            console.log("not a valid user")
            return res.status(400).json({status:'error', message:'user not approved'})
        }
        done()
    };

    app.post('/auth/test/:username',(req,res)=>{
        console.log("got a test login")
        if(options.TEST_AUTH) {
            const accessKey = generateTestingLogin(req.params.username)
            res.json({'access-key': accessKey})
        }
    })
    app.get('/auth/github',  passport.authenticate('github'))
    app.get('/auth/github/callback', passport.authenticate('github',{failureRedirect:'/login'}),
        (req,res)=> res.send(authTemplate(req)))

    app.post('/docs/:username/delete/',allowed,(req,res)=>{
        console.log("deleting docs with query",req.query)
        deleteDocs(req.user.username,req.query)
            .then(docs => res.json({success:true, docs:docs}))
    })

    app.get('/docs/:username/search', allowed, (req,res)=>{
        console.log("current user is: ",req.user?req.user.username:"no user")
        console.log("username is",req.params.username)
        if(req.user.username !== req.params.username) return res.json({success:false, message:"incorrect user"})
        console.log("searching. query  is",req.query)
        const query = {}
        query.username = req.user.username
        if(req.query.type) query.type = req.query.type
        if(req.query.mimetype) query.mimetype = req.query.mimetype
        if(req.query.title) query.title = req.query.title

        findDoc(req.username,query).then(docs => res.json({success:true, results:docs}))
    })
    app.post('/docs/:username/upload/',allowed, (req,res) => {
        console.log("doing an upload",req.query, req.body)
        // console.log("type is",req.headers)
        if(req.headers['content-type'].startsWith('multipart')) {
            console.log("it's multipart")
            new formidable.IncomingForm().parse(req, (err,fields,files)=>{
                req.body = fields
                if(!files.file) return res.json({success:false,message:"upload file should use multipart with a file named file"})
                saveDoc(req.user.username,req.query,{},files.file).then(doc => res.json({success:true,doc}))
            })
            return
        }
        saveDoc(req.user.username,req.query,req.body).then(doc => res.json({success:true,doc}))
    })
    app.get('/docs/:username/data/:docid/latest/:mtype/:msubtype/:filename', (req,res)=>{
        console.log("fetching the doc")
        const docid = req.params.docid
        console.log("using the docid",docid)
        loadDoc(req.params.username,docid).then(doc => {
            const pth = path.resolve(doc.datapath)
            console.log("retrieved the doc",doc,pth)
            const type = 'application/json'
            console.log('setting hte type to',type)
            if(doc.mimetype) res.set('Content-Type',doc.mimetype)
            res.sendFile(pth)
        })
    })
    app.get('/docs/:username/info/:docid/:version',(req,res) => {
        loadDoc(req.params.username,req.params.docid).then(doc => {
            console.log("got the doc",doc)
            res.json({doc:doc})
        })
    })

    // upload a thumbnail
    app.post('/docs/:username/thumbnail/:docid/:version/:mtype/:msubtype/:width/:height/:filename',allowed,(req,res) => {
        console.log("doing a thumbnail upload", req.params)
        if(req.headers['content-type'].startsWith('multipart')) {
            // console.log("it's multipart")
            new formidable.IncomingForm().parse(req, (err,fields,files)=>{
                req.body = fields
                // console.log("files?",files,fields)
                if(!files.thumbnail) return res.json({success:false,message:"upload file should use multipart with a file named thumbnail"})
                saveThumbnail(req.user.username,req.params,files.thumbnail)
                    .then(doc => res.json({success:true,doc}))
            })
        } else {
            console.log("no image attached")
            return res.status(400).json({status:'error', message:'no image attached to upload'})
        }
    })


app.listen(options.PORT,()=>console.log(`running docserver on port ${options.PORT} with github auth`))

    return app
}

module.exports.startServer = startServer
