import axios from 'axios';
import { API_ENDPOINT, API_REQUEST_CONFIG } from '../config/index';

export async function getUser() {
    let user = 'Anonymous';
    await axios.get("https://tosecurityandbeyond.mynetgear.com/user/current.json", { withCredentials: true }, API_REQUEST_CONFIG
    ).then((res) => {
        user = res.data.profiles[0];
    }).catch((err) => {
        console.dir(err);
    })
    return user;
}

export async function getMediaRequestUser() {
    let user = 'Anonymous';
    await axios.get("https://tosecurityandbeyond.mynetgear.com/user/current.json", { withCredentials: true }, API_REQUEST_CONFIG
    ).then((res) => {
        user = res.data.profiles[0].user.username;
    }).catch((err) => {
        console.dir(err);
    })
    return user;
}

export async function addMediaRequest(props) {
    const value = props.value;
    const body = {
        id: value.id,
        title: value.title || value.name,
        posterPath: value.poster_path,
        createdAt: new Date().toUTCString(),
        originalTitle: value.original_name || value.original_title || null,
        releaseDate: value.release_date || value.first_air_date || null,
        adult: value.adult || false,
        mediaType: value.media_type || null,
        queueStatus: value.queueStatus || null,
        queueMessage: value.queueMessage || null,
        requestUser: await getMediaRequestUser() || null,
    };
    await axios.put(`${API_ENDPOINT}/requests`, body, API_REQUEST_CONFIG)
        .then(() => {
            props.handleRequestSubmit();
        });
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