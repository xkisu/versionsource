const express = require('express')
const app = express()

const VersionSource = require('../')
const serve = new VersionSource({
    repositories: {
        path: './repositories'
    }
})

serve.on('info', info => {
    console.log('info')
    console.log('repository: ' + info.repo)
    info.accept()
})

serve.on('head', head => {
    console.log('head')
    console.log('repository: ' + head.repo)
    head.accept()
})

serve.on('fetch', fetch => {
    console.log('fetch')
    console.log(' - repository: ' + fetch.repo)
    fetch.accept()
})

serve.on('tags', tags => {
    console.log('tags')
    console.log(' - repository: ' + tags.repo)
    tags.accept()
})

serve.on('push', push => {
    console.log('push')
    console.log(' - repository: ' + push.repo)
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
