import Firebase from 'firebase/app';
import 'firebase/firestore';
import 'firebase/auth';
import bcrypt from 'bcryptjs';
import { firebaseConfig } from '../../config/auth';

// 1) when seeding the database you'll have to uncomment this!
// import { seedDatabase } from './seed';

const config = firebaseConfig;

const firebase = Firebase.initializeApp(config);
// 2) when seeding the database you'll have to uncomment this!
// seedDatabase(firebase);
// 3) once you have populated the database (only run once!), re-comment this so you don't get duplicate data

const db = firebase.firestore();

const getAllMediaRequest = async () => {
    const mediaRequestsRef = db.collection('media_requests');
    // get all documents in this collection
    //   - returns an array of docs
    const fetchData = async () => {
        let docs = [];
        await mediaRequestsRef.get()
            // if successfull get array of collection data 
            .then(function (result) {
                result.forEach(doc => {
                    docs.push(doc.data());
                });
            });
        return docs;
    };

    return await fetchData();
}

const addMediaRequest = async (props) => {
    // all search.value properties
    // MOVIE
    // {
    //     adult: false
    //     backdrop_path: "/smqQ71MIn1DSdSiQzCzCOV6rgRq.jpg"
    //     genre_ids: (4)[28, 12, 878, 53]
    //     id: 435
    //     original_language: "en"
    //     original_title: "The Day After Tomorrow"
    //     overview: "<Plot Summary>"
    //     popularity: 17.629
    //     poster_path: "/mr1GBm0CXFA2lBKvl4voCYfkfL0.jpg"
    //     release_date: "2004-05-26"
    //     title: "The Day After Tomorrow"
    //     video: false
    //     vote_average: 6.5
    //     vote_count: 5946
    // }
    // TVSHOW
    // { 
        // backdrop_path: "/hHEqDPbO6z4Xje5tOf3Wm1mdMtI.jpg"
        // first_air_date: "2018-08-17"
        // genre_ids: (4)[16, 35, 10759, 9648]
        // id: 73021
        // name: "Disenchantment"
        // origin_country: ["US"]
        // original_language: "en"
        // original_name: "Disenchantment"
        // overview: "Set in a ruined medieval city called Dreamland, Disenchantment follows the grubby adventures of a hard-drinking princess, her feisty elf companion and her personal demon."
        // popularity: 33.383
        // poster_path: "/1WynayCqKRzrl4cFZR8NOfiDwd6.jpg"
        // vote_average: 7.5
        // vote_count: 423
    // }
    let mediaRequest = {
        id: '',
        title: '',
        year: '',
        posterPath: ''
    };
    const salt = "$2a$05$jRvzuDokuXN4fNW9SkGQbe";
    if (props.value && (props.value.title || props.value.name)) {
        mediaRequest.title = props.value.title || props.value.name;
        if (props.value.release_date || props.value.first_air_date) {
            mediaRequest.year = parseInt(props.value.release_date) || parseInt(props.value.first_air_date);
            mediaRequest.id = bcrypt.hashSync((mediaRequest.title += mediaRequest.year), salt).replace(/\//g, "");
        }
        else {
            mediaRequest.id = bcrypt.hashSync((mediaRequest.title), salt).replace(/\//g, "");
        }
        if (props.value.poster_path) {
            mediaRequest.posterPath = props.value.poster_path;
        }
    }
    else if (props.input) {
        mediaRequest.title = props.input;
    }
    else {
        throw new Error('Media value or format is invalid...');
    }

    const mediaRequestsRef = db.collection('media_requests');
    await mediaRequestsRef.doc(mediaRequest.id).set({...mediaRequest});

    return await mediaRequestsRef.get();
}

export { firebase, getAllMediaRequest, addMediaRequest };