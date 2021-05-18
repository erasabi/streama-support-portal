import { v4 as uuidv4, v4 } from 'uuid';

export function seedDatabase(firebase) {
    function getUUID() {
        return uuidv4();
    }

    /* Series
      ============================================ */
    // Documentaries
    firebase.firestore().collection('message_requests').add({
        id: getUUID(),
        title: 'The Matrix',
        year: 1991,
        posterPath: '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg'
    });
}