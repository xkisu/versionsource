/**
 * GitMessage code adapted from https://github.com/substack/pushover/pull/10/files
 * Original code Copyright 2012 [dz0ny](https://github.com/dz0ny)
 * Modified code Copyright 2018 Keith Mitchell
 */

class GitMessage {
    constructor (stream) {
        this.stream = stream
    }

    _pack (type, msg) {
        var length
        msg = type + msg

        // rpc messange consists of each line preceded by its length (including the header) as a 4-byte hex number.
        length = (msg.length + 4 + 0x10000).toString(16).substr(-4).toUpperCase()
        return length + msg
    }

    write (msg) {
        // \2 is verbose messange defined by git protocol
        return this.stream.write(this._pack("\u0002", msg))
    }

    error () {
        // \3 is error message defined by git protocol
        this.stream.write(this._pack("\u0003", msg))
        return this.end
    }

    end (msg) {
        if (msg) {
            this.write(msg)
        }
        return this.stream.end("00000000")
    }
}

module.exports = GitMessage