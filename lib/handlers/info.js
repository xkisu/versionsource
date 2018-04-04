/*
    MIT License

    Original work Copyright (c) 2015 substack
    Modified work Copyright (c) 2018 Keith Mitchell

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
*/

const debug = require('debug')('versionsource:handlers:info')

const path = require('path')
const fs = require('fs')

const mkdirp = require('mkdirp')
const spawn = require('child_process').spawn;

const httpDuplex = require('http-duplex')

const services = [
    'upload-pack',
    'receive-pack'
]

module.exports = function (options) {
    const self = this

    if (!options.params.service) {
        options.response.statusCode = 400;
        options.response.setHeader('content-type', 'text/plain');
        options.response.end('service parameter required');
        debug('missing service parameter')
        debug('400')
        return;
    }

    var service = options.params.service.replace(/^git-/, '');
    if (services.indexOf(service) < 0) {
        options.response.statusCode = 405;
        options.response.setHeader('content-type', 'text/plain');
        options.response.end('service not available');
        debug('service not avaliable')
        debug('405')
        return;
    }

    const duplex = httpDuplex(options.request, options.response)
    duplex.cwd = self._getPath(options.repository)
    duplex.repo = options.repository

    debug('cwd: %s', duplex.cwd)
    debug('repo: %s', duplex.repo)

    duplex.accept = duplex.emit.bind(duplex, 'accept');
    duplex.reject = duplex.emit.bind(duplex, 'reject');
    
    duplex.once('reject', function (code) {
        options.response.statusCode = code || 500
        options.response.end()
    })

    const process = function () {
        debug('setting responce headers')
        // disable caching
        options.response.setHeader('content-type', 'application/x-git-' + service + '-advertisement')
        options.response.setHeader('expires', 'Fri, 01 Jan 1980 00:00:00 GMT')
        options.response.setHeader('pragma', 'no-cache')
        options.response.setHeader('cache-control', 'no-cache, max-age=0, must-revalidate')
        serviceRespond(self, service, duplex.cwd, options.response)
    }

    self._repoExists(duplex.repo).then((exists) => {
        duplex.exists = exists
        if(!exists && self.opts.repositories.create) {
            debug('repo doesn\'t exist, creating.. %s %s', exists, duplex.cwd)
            duplex.once('accept', function () {
                self._create(options.repository).then(repo => {
                    process()
                }).catch(err => {
                    options.response.statusCode = 500;
                    options.response.setHeader('content-type', 'text/plain');
                    options.response.setHeader('content-type', 'text/plain');
                    options.response.end('server failed to create repository directory');
                    console.error(err)
                })
            })

            self.emit('info', duplex)

            if(!self.listeners('info').length) duplex.accept()
        } else if (!exists) {
            debug('repo doesn\'t exist, 404')
            options.response.statusCode = 404;
            options.response.setHeader('content-type', 'text/plain');
            options.response.end('repository not found');
        } else {
            debug('repo exists, continuing')
            duplex.once('accept', process);
            self.emit('info', duplex)

            if(!self.listeners('info').length) duplex.accept()
        }
    })

}

function serviceRespond (self, service, file, res) {
    debug('responding with command pipe')

    function pack (s) {
        var n = (4 + s.length).toString(16)
        return Array(4 - n.length + 1).join('0') + n + s
    }
    res.write(pack('# service=git-' + service + '\n'))
    res.write('0000')
    
    var cmd = [ 'git', service, '--stateless-rpc', '--advertise-refs', file ]
    debug('executing: %s', cmd.join(' '))
    var ps = spawn(cmd[0], cmd.slice(1))
    ps.on('error', function (err) {
        debug(err.message + ' running command ' + cmd.join(' '))
        self.emit('error', new Error(
            err.message + ' running command ' + cmd.join(' ')
        ))
    })

    ps.stdout.pipe(res)
}