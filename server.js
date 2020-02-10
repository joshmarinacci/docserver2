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


function setupOptions() {
    let options = {
        AUTH_ENABLED:true
    }
    if(fs.existsSync('config.json')) {
        options = Object.assign(options,JSON.parse(fs.readFileSync('config.json').toString()))
    }
    if(process.env.USERS) options.USERS = process.env.USERS
    if(!options.USERS) throw new Error("USERS not defined")
    options.ALLOWED_USERS=options.USERS.split(",")

    if(process.env.GITHUB_CALLBACK_URL) options.GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL
    if(!options.GITHUB_CALLBACK_URL) throw new Error("GITHUB_CALLBACK_URL not defined")

    if(process.env.GITHUB_CLIENT_ID) options.GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID
    if(!options.GITHUB_CLIENT_ID) throw new Error("GITHUB_CLIENT_ID not defined")
    if(process.env.GITHUB_CLIENT_SECRET) options.GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET
    if(!options.GITHUB_CLIENT_SECRET) throw new Error("GITHUB_CLIENT_SECRET not defined")
    if(process.env.PORT) options.PORT = process.env.PORT
    if(!options.PORT) throw new Error("PORT not defined")

    console.log("options",options)
    return options
}

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

    function saveDoc(username, query, body) {
        return new Promise((res,rej)=>{
            console.log("saving the doc",body,'using query',query,'username',username)
            const fid = "data"+Math.floor(Math.random()*10*1000*1000)
            const fpath = path.join(options.DIR,'data',username,fid)
            const fdir = path.join(options.DIR,'data',username)

            const meta = {
                type: query.type?query.type:'unknown',
                title:query.title?query.title:'untitled',
                mimetype:'application/json',
                extension:'json',
                datapath:fpath
            }
            console.log("writing to disk as",fpath)
            // const file = fs.createWriteStream(fpath,{encoding:'binary'})
            const data = JSON.stringify(body)
            console.log("Making the dir",fdir)
            mkdir(fdir).then(()=>{
                console.log("made the dir",fdir)
                fs.writeFile(fpath,data,(err)=>{
                    if(err) return rej(err)
                    DB.insert(meta,(err,newDoc)=>{
                        if(err) return rej(err)
                        console.log("the new doc is",newDoc)
                        return res(newDoc)
                    })
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
            if (options.ALLOWED_USERS.indexOf(profile.username) < 0) return
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

    app.get('/docs/:username/search', allowed, (req,res)=>{
        console.log("current user is",req.user)
        console.log("username is",req.params.username)
        if(req.user.username !== req.params.username) return res.json({success:false, message:"incorrect user"})
        console.log("searching. query  is",req.query)
        const query = {}
        if(req.query.type) query.type = req.query.type
        if(req.query.mimetype) query.mimetype = req.query.mimetype

        findDoc(req.username,query).then(docs => res.json({success:true, results:docs}))
    })
    app.post('/docs/:username/upload/',allowed, (req,res) => {
        console.log("doing an upload",req.query, req.body)
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


app.listen(options.PORT,()=>console.log(`running docserver on port ${options.PORT} with github auth`))

    return app
}

module.exports.startServer = startServer
