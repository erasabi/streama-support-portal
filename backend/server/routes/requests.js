// requests.js

var express = require('express');
var router = express.Router();
var db = require('../database');

router.get("/all", function(req, res) {
    db.Request.findAll()
        .then( requests => {
            res.status(200).send(JSON.stringify(requests));
        })
        .catch( err => {
            res.status(500).send(JSON.stringify(err));
        });
});

router.put("/", function (req, res) {
    db.Request.create({
        id: req.body.id,
        title: req.body.title || '',
        posterPath: req.body.posterPath || '',
        createdAt: req.body.createdAt || '',
        originalTitle: req.body.originalTitle || null,
        releaseDate: req.body.releaseDate || null,
        adult: req.body.adult || false,
        mediaType: req.body.mediaType || null,
        queueStatus: req.body.queueStatus || null,
        queueMessage: req.body.queueMessage || null,
        requestUser: req.body.requestUser || null,
    })
        .then(response => {
            console.dir(JSON.stringify(response));
            res.status(200).send(JSON.stringify(response));
        })
        .catch(err => {
            res.status(500).send(JSON.stringify(err));
        });
});

router.delete("/:id", function(req, res) {
    db.Request.destroy({
        where: {
            id: req.params.id
        }
    })
        .then(() => {
            res.status(200).send();
        })
        .catch(err => {
            res.status(500).send(JSON.stringify(err));
        });
});

module.exports = router;
