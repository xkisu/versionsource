const express = require('express')
const app = express()

const VersionSource = require('../')
const serve = new VersionSource({
    repositories: {
        path: './repositories'
    }
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
    console.log('Example "Basic" ready!')
})
