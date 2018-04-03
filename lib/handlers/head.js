const debug = require('debug')('versionsource:handlers:head')

const fs = require('fs')

module.exports = function (options) {
    var self = this

    // only GET is supported for HEAD
    if (options.request.method !== 'GET') {
        options.response.statusCode = 405
        options.response.setHeader('content-type', 'text/plain');
        options.response.end('method not supported')
        debug('method "%s" not supported', options.request.method)
        return;
    }

    // called when the request is accepted
    const process = () => {
        debug('processing response')
        // get the path to the HEAD file
        const headpath = self._getRepositoryFilePath(options.repository, 'HEAD')
        // make sure it exists and stream the file to the response
        self._fileExists(options.repository, 'HEAD').then(exists => {
            if(exists) fs.createReadStream(headpath).pipe(res)
        })
    }

    var duplex = httpDuplex(req, res);
    duplex.repo = repo;
    duplex.cwd = self._getPath(options.repository);

    debug('cwd: %s', duplex.cwd)
    debug('repo: %s', duplex.repo)
    
    duplex.accept = duplex.emit.bind(duplex, 'accept');
    duplex.reject = duplex.emit.bind(duplex, 'reject');

    duplex.once('reject', function (code) {
        duplex.statusCode = code || 500;
        duplex.end();
    })

    // check if repo exists
    self._exists(options.repository).then(exists => {
        duplex.exists = exists

        // create the repo if autocreate is enabled
        if (!exists && self.opts.repositories.create) {
            debug('repo directory doesn\'t exist, creating')
            duplex.once('accept', function (dir) {
                // create the repository and then process the response
                self._create(options.repository).then(repo => {
                    process()
                }).catch(err => {
                    options.response.statusCode = 500;
                    options.response.setHeader('content-type', 'text/plain');
                    options.response.end('server failed to create repository directory');
                    console.error(err)
                })
            })

            self.emit('head', duplex);
            // auto accept request if no listeners are supplied
            if (!self.listeners('head').length) duplex.accept();
        } else if (!exists) {
            debug('repo directory doesn\'t exist!')
            options.response.statusCode = 404;
            options.response.setHeader('content-type', 'text/plain');
            options.response.end('repository not found');
        } else { // if directory exists just go right to processing
            debug('repo directory exists')
            duplex.once('accept', process);
            self.emit('head', duplex);
            if (!self.listeners('head').length) duplex.accept();
        }
    })

}