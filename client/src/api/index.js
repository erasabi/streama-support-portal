import axios from 'axios'
import { API_ENDPOINT, API_REQUEST_CONFIG, NODE_ENV, STREAMA_ENDPOINT } from '../config/index';

export async function getRequestedMedia() {
    return await axios.get(`${API_ENDPOINT}/requests/all`, API_REQUEST_CONFIG)
}

export async function getUser() {
    let user = 'Anonymous';
    if (NODE_ENV === 'none') return {}

    await axios.get(`${STREAMA_ENDPOINT}/user/current.json`, { withCredentials: true }, API_REQUEST_CONFIG
    ).then((res) => {
        user = res.data.profiles[0];
    }).catch((err) => {
        console.dir(err);
    })
    return user;
}

export async function searchMediaSuggestions(searchValue) {
    return await axios.get('https://api.themoviedb.org/3/search/multi?api_key=11cce9d83563a5188d7201b2514f7286&language=en-US&include_adult=false&sort_by="vote_count.desc"&query=' + searchValue)
}

export async function addMediaRequest(body) {
    return await axios.put(`${API_ENDPOINT}/requests`, body, API_REQUEST_CONFIG)
}

export async function deleteMediaRequest(props, id) {
    await axios.delete(`${API_ENDPOINT}/requests/${id}`, API_REQUEST_CONFIG)
        .then(() => {
            props.handleRequestSubmit();
        });
}

export async function updateMediaRequest(props, id, updatedProps) {
    const body = {
        id: props.id,
        title: props.title || props.name,
        posterPath: props.posterPath,
        createdAt: new Date().toUTCString(),
        originalTitle: props.originalName || props.originalTitle || null,
        releaseDate: props.releaseDate || props.firstAirDate || null,
        adult: props.adult || false,
        mediaType: props.mediaType || null,
        queueStatus: updatedProps.queueStatus || null,
        queueMessage: updatedProps.queueMessage || null,
        requestUser: props.requestUser || null,
    };
    await axios.put(`${API_ENDPOINT}/requests/${id}`, body, API_REQUEST_CONFIG)
        .then(() => {
            props.handleRequestSubmit();
        });
}