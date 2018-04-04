const express = require('express')
const app = express()

const VersionSource = require('../')
const GitMessage = require('../message')
const serve = new VersionSource({
    repositories: {
        path: './repositories'
    }
})

serve.on('info', info => { // emitted when repo is queried for info
    console.log('info')
    console.log('repository: ' + info.repo)
    info.accept()
})

serve.on('head', head => { // emitted when queried for HEAD
    console.log('head')
    console.log('repository: ' + head.repo)
    head.accept()
})

serve.on('tags', tags => { // emitted for push --tags
    console.log('tags')
    console.log(' - repository: ' + tags.repo)
    tags.accept()
})

serve.on('fetch', fetch => { // emitted by clone and pull
    console.log('fetch')
    console.log(' - repository: ' + fetch.repo)
    fetch.accept()
})

serve.on('push', push => { // emitted for a push
    console.log('push')
    console.log(' - repository: ' + push.repo)

    // event to inject data into response stream after git data has been sent
    push.on('response', function(resp) {
        // stream wrapper for packing git messages
        const m = new GitMessage(resp.stream)
        m.write('Processing...\n')
        setTimeout(() => {
            // close the message stream
            m.end('This is VersionSource!\n')
            // close the response stream
            resp.end()
        }, 2000)
    })

    push.accept()
})

app.all('/:username/:repo.git/*', (req, res) => {
    const username = req.params.username
    const repo = req.params.repo

    serve.process({
        repository: `/${username}/${repo}.git/`, // path to the repository in the storage directory
        path: req.params[0], // the git part of the path, the part after the git url supplied to the command line
        params: require('querystring').parse(require('url').parse(req.url).query), // query string parameters in object form (can also be passed as the query string without the begining ?)
        request: req,
        response: res
    })
})

app.listen(3000, () => {
    console.log('Example "Events" ready!')
})
