const debug = require('debug')('versionsource')
const debugProcess = require('debug')('versionsource:process')

const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')

const extend = require('extend')
const querystring = require('querystring')

const EventEmitter = require('events')
const zlib = require('zlib')
const NodeGit = require("nodegit")

// base options for new library instance
const baseOpts = {
    encodings: { // supported encodings for requests
        'gzip': () => zlib.createGunzip(),
        'deflate': () => zlib.createDeflate() 
    },
    authentication: {
        realm: 'VersionSource' // realm for basicauth
    },
    repositories: {
        create: true // create repository directory if it doesn't exist
    }
}

// map url regexes to handlers
const handlers = {
    'info': /(\/)?info\/refs$/,
    'head': /(\/)?HEAD$/,
    'action': /(\/)?git-(.+)/
}

class VersionSource extends EventEmitter {
    constructor (opts) {
        super()

        // check for errors in the user supplied options
        if(!opts.repositories) {
            throw new Error('VersionSource "repositories" option must be defined!')
        } else { 
            if(!opts.repositories.path) {
                throw new Error('VersionSource "repositories.path" option must be defined!')
            } else if (!fs.existsSync(opts.repositories.path)) {
                throw new Error('VersionSource "repositories.path" does not exist!')
            }
        }
        // extend the default options, deep extend
        this.opts = extend(true, baseOpts, opts || {})
    }

    // process http/https requests
    process (opts, req, res) {

        debugProcess('process request')

        // check for errors...
        if(!opts.repository)
            throw new Error('VersionSource process "repository" option must be specified!')
        debugProcess('repository: %s', opts.repository)

        if(!opts.path)
            throw new Error('VersionSource process "path" option must be specified!')
        debugProcess('path: %s', opts.path)

        if(!opts.request)
            throw new Error('VersionSource process "request" option must be specified and a value http request object')
        debugProcess('request: %s', opts.request)

        if(!opts.response)
            throw new Error('VersionSource process "response" option must be specified and a value http response object')
        debugProcess('response: %s', opts.response)

        // shouldn't be a problem, but play safe incase someone stuck a fancy character in a branch or tag name
        opts.path = decodeURIComponent(opts.path)
        debugProcess('decoded path: %s', opts.path)

        if (opts.params) {
            if((typeof opts.params) == 'string') { // if the query parameters are supplied as a string
                // decode to be on the safe side
                opts.params = decodeURIComponent(opts.params)
                // parse the parameters into an object
                opts.params = querystring.parse(tops.querystring)
                debugProcess('params: %O', opts.params)
            } else if (opts.params !== null && (typeof opts.params) === 'object') {
                // nothing to do
                debugProcess('params: %O', opts.params)
            } else {
                throw new Error('VersionSource process params supplied in an unknown type!')
            }
        }


        var handler = undefined

        for (let handle in handlers) { 
            const regex = handlers[handle]

            if(opts.path.match(regex)){
                handler = handle
            }
        }

        if (handler) {
            const modulePath = './lib/handlers/' + handler
            debugProcess('handling request with handler: %s', modulePath)
            if (require.resolve(modulePath)) {
                console.log(modulePath)
                require(modulePath).call(this, opts)
            } else {
                throw new Error(`VersionSource cannot find internal handler module for "${modulePath}"!`)
            }
        } else {
            if (req.method !== 'GET' && req.method !== 'POST') {
                res.statusCode = 405
                res.end('method not supported')
            } else {
                res.statusCode = 404
                res.end('not found')
            }
        }
    }

    _getPath (repository) {
        return path.resolve(path.join(this.opts.repositories.path, repository))
    }

    _create (repository) {
        const repoPath = this._getPath(repository)
        return new Promise((resolve, reject) => {
            fs.exists(repoPath, (exists) => {
                if(!exists && this.opts.repositories.create) {
                    mkdirp(repoPath, function (err) {
                        if(err) {
                            reject(err)
                        } else {
                            NodeGit.Repository.init(repoPath, 1).then(repo => {
                                resolve(repo)
                            })
                        }
                    })
                } else {
                    reject()
                }
            })
        })
    }
}

module.exports = VersionSource