let express = require('express');
let router = express.Router();
let db = require('../database');
// let db = require('../models');

const getDbConnectionStatus = async () => {
    try {
        await db.sequelize.authenticate();
        console.log('Connection has been established successfully.');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
    }
};
getDbConnectionStatus();

router.get("/all", function(req, res) {
    console.log('test');
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

router.put("/:id", function (req, res) {
    db.Request.update({
        title: req.body.title || '',
        posterPath: req.body.posterPath || '',
        originalTitle: req.body.originalTitle || null,
        releaseDate: req.body.releaseDate || null,
        adult: req.body.adult || false,
        mediaType: req.body.mediaType || null,
        queueStatus: req.body.queueStatus || null,
        queueMessage: req.body.queueMessage || null,
        requestUser: req.body.requestUser || null,
    },
    {
        where: {
            id: req.params.id
        }
    })
        .then(response => {
            res.status(200).send(JSON.stringify(response));
        })
        .catch(err => {
            res.status(500).send(JSON.stringify(err));
        });
});

module.exports = router;
