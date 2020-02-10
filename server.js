const express = require('express')
const fs = require('fs')
const bodyParser = require('body-parser')
const passport = require('passport')
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

function startServer(options) {

// let options = setupOptions()
const app = express()
app.use(bodyParser.json({limit:'20MB'}))
app.use(bodyParser.urlencoded())
app.use(cors())

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


const allowed = (req,res,done) => {
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

app.get('/github',  passport.authenticate('github'))
app.get('/github/callback', passport.authenticate('github',{failureRedirect:'/login'}),
    (req,res)=> res.send(authTemplate(req)))


app.listen(options.PORT,()=>console.log(`running docserver on port ${options.PORT} with github auth`))

    return app
}

module.exports.startServer = startServer
