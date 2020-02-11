const fs = require('fs')
const fsPromises = fs.promises;
// const path = require('path')

const server = require('./server')

// console.log("env",process.env)
const CONFIG = {
    GITHUB_CLIENT_ID:null,//process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET:null,//process.env.GITHUB_CLIENT_SECRET,
    GITHUB_CALLBACK_URL:null,//process.env.GITHUB_CALLBACK_URL,
    DIR:null,//process.env.DIR,
    AUTH_ENABLED: true,
    TEST_AUTH: false,
    PORT:-1,//3000,
    ALLOWED_USERS:[],
    // ADMIN_USERS:['joshmarinacci'],
    // SKIP_AUTH:(process.env.SKIP_AUTH==="true")?true:false,
    // INSECURE_AUTH:false,
}

function parseEnvFile(envStr) {
    const obj = {}
    envStr.split("\n").map(line => {
        const parts = line.split("=")
        obj[parts[0]] = parts[1]
    })
    return obj
}

const NUMERIC_KEYS = ['PORT']
const BOOLEAN_KEYS = ['AUTH_ENABLED','TEST_AUTH']
const ARRAY_KEYS = ['ALLOWED_USERS']
async function setup(CONFIG) {
    console.log("using config",CONFIG)
    try {
        await fsPromises.access('.env', fs.constants.R_OK)
        const envStr = (await fsPromises.readFile('.env')).toString()
        const env = parseEnvFile(envStr)
        Object.keys(env).forEach(key => {
            CONFIG[key] = env[key]
            if(NUMERIC_KEYS.includes(key)) CONFIG[key] = parseInt(env[key])
            if(BOOLEAN_KEYS.includes(key)) CONFIG[key] = (env[key] === 'true')
            if(ARRAY_KEYS.includes(key)) CONFIG[key] = env[key].split(",")
        })
    } catch (e) {
        console.log("caught",e)
    }
    return CONFIG
}
setup(CONFIG)
    .then(CONFIG => {
        console.log("final config",CONFIG)
        server.startServer(CONFIG)
    })


