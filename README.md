# VersionSource

A NodeJS module for serving git repositories from NodeJS via HTTP or SSH. 

Insperation and some small parts of code taken from [pushover](https://github.com/substack/pushover) by substack. I wanted to use pushover for a project, but pushover hasn't been maintained for 4+ years so I decided to make my own approch with all the features I wanted.

# Basic Usage

## HTTP

```Javascript
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

```

## SSH

```Javascript

```

# FAQ

## Connecting to Git SSH on non-standard port
See https://stackoverflow.com/questions/1558719/using-a-remote-repository-with-non-standard-port

# TODO

 * Automated tests, use NodeGIT and check for response messages
   * git pull on new repository
   * "Your configuration specifies to merge with the ref 'refs/heads/master'
      from the remote, but no such ref was fetched."
 * Option for VersionSource to make an automated inital commit with array of default files
 * Clean up the use of `through` in the action handler
 * Clean up events in `lib/handlers/action.js`
 * User docs
 * API/library docs
 * Authentiction
 * SSH
 * Distributed server storage


# Ideas

 * Custom CI and build via custom docker containers
  * LG webOS app build
  * Unity build
  * c++ make/cmake build

# Notes
