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

const debug = require('debug')('versionsource:handlers:action')

const through = require('through')
const httpDuplex = require('http-duplex')

const spawn = require('child_process').spawn

const services = [
    'upload-pack',
    'receive-pack'
]

const headerRegexes = {
    'receive-pack': '([0-9a-fA-F]+) ([0-9a-fA-F]+)'
    + ' refs\/(heads|tags)\/(.*?)( |00|\u0000)'
    + '|^(0000)$',
    'upload-pack': '^\\S+ ([0-9a-fA-F]+)'
}

module.exports = function (options) {
    if(options.request.method !== 'POST') {
        options.response.statusCode = 405
        options.response.setHeader('content-type', 'text/plain')
        options.response.end('method not supported')
        debug('method "%s" not supported', options.request.method)
        return
    }

    const self = this

    const m = options.request.url.match(/\/(.+)\/git-(.+)/)

    if (/\.\./.test(m[1])) {
        options.response.statusCode = 500
        options.response.setHeader('content-type', 'text/plain')
        options.response.end('malformed service url')
        debug('method "%s" not supported', options.request.method)
        return
    }

    const repo = m[1], service = m[2]

    if (services.indexOf(service) < 0) {
        options.response.statusCode = 405
        options.response.setHeader('content-type', 'text/plain')
        options.response.end('service not available')
        debug('service "%s" not supported', service)
        return
    }

    // disable caching
    options.response.setHeader('content-type', 'application/x-git-' + service + '-result')
    options.response.setHeader('expires', 'Fri, 01 Jan 1980 00:00:00 GMT')
    options.response.setHeader('pragma', 'no-cache')
    options.response.setHeader('cache-control', 'no-cache, max-age=0, must-revalidate')

    const duplex = httpDuplex(options.request, options.response)

    duplex.cwd = self._getPath(options.repository)
    duplex.repo = options.repository

    duplex.service = service
    debug('service %s', service)

    duplex.accept = duplex.emit.bind(duplex, 'accept');
    duplex.reject = duplex.emit.bind(duplex, 'reject');

    debug('creating streams')
    const buffered = through().pause()
    // stream needed to receive data after decoding, but before accepting
    const ts = through()

    const decoder = self.opts.encodings[options.request.headers['content-encoding']]
    if (decoder) {
        debug('decoding input stream from %s', options.request.headers['content-encoding'])
        options.request.pipe(decoder()).pipe(ts).pipe(buffered)
    } else {
        options.request.pipe(ts).pipe(buffered)
    }

    var data = ''
    ts.once('data', function (buf) {
        data += buf

        debug('data: %O', data)
        debug('regex: %s', new RegExp(headerRegexes[duplex.service], 'gi'))

        // TODO: find out why the gi flags are so important (do they only match once?)
        var ops = data.match(new RegExp(headerRegexes[duplex.service], 'gi'))
        debug('filtered data: %O', ops)
        //TODO: send a response instead of just letting it hang
        if (!ops) return

        data = undefined // TODO: clean up events
        ops.forEach(function(op) {
            debug('regex: %s', headerRegexes[duplex.service])
            debug('raw op: \'%s\'', op)
            debug('op: %o', op)
            var m = op.match(new RegExp(headerRegexes[duplex.service]))
            debug('m: %O', m)
            if (duplex.service === 'receive-pack') {
                duplex.last = m[1]
                duplex.commit = m[2]

                var headers = {
                    last: duplex.last,
                    commit : duplex.commit
                }

                if (m[3] == 'heads') {
                    var type = 'branch'
                    headers[type] = duplex[type] = m[4]
                    debug('event push')
                    self.emit('push', duplex)
                    if (self.listeners('push').length == 0) duplex.accept()
                } else {
                    var type = 'version'
                    headers[type] = duplex[type] = m[4]
                    debug('event tag')
                    self.emit('tag', duplex)
                    if (self.listeners('tag').length == 0) duplex.accept()
                }
                duplex.emit('header', headers)
                debug('headers %O', headers)
            } else if (duplex.service === 'upload-pack') {
                duplex.commit = m[1]
                duplex.evName = 'fetch'
                // duplex.emit('header', { commit : duplex.commit })
                debug('fetch %O', { commit : duplex.commit })
                self.emit('fetch', duplex)
                if (self.listeners('fetch').length == 0) duplex.accept()
            }
        })
    })

    duplex.once('accept', function () {
        debug('accepted')
        process.nextTick(function () {
            // TODO: proper error handling, for some reason if service is null it doesn't error but pipes the error to the output and ends the stream which throws a git error
            var cmd = [ 'git', duplex.service, '--stateless-rpc', duplex.cwd ]
            debug('running command %s', cmd.join(' '))
            var ps = spawn(cmd[0], cmd.slice(1))
            ps.on('error', function (err) {
                debug('error running command %s \n%s\n%o', cmd.join(' '), err.message, err)
                duplex.emit('error', new Error(
                    err.message + ' running command ' + cmd.join(' ')
                ))
            })
            
            duplex.emit('service', ps)
            
            var respStream = through(function(c) {
                if (duplex.listeners('response').length === 0)
                    return this.queue(c)
                // prevent git from sending the close signal
                if (c.length === 4 && c.toString() === '0000')
                    return
                this.queue(c)
            }, function() {
                if (duplex.listeners('response').length > 0)
                    return
                this.queue(null)
            })
            
            function endResponse() {
                debug('ending response')
                respStream.queue(new Buffer('0000'))
                respStream.queue(null)
            }

            debug('piping responce')
            duplex.emit('response', respStream, endResponse);
            ps.stdout.pipe(respStream).pipe(options.response);
            
            buffered.pipe(ps.stdin);
            buffered.resume();
            ps.on('exit', duplex.emit.bind(duplex, 'exit'));
        });
    });
    
    duplex.once('reject', function (code, msg) {
        debug.log('rejected')
        options.response.statusCode = code
        options.response.end(msg)
    })
}