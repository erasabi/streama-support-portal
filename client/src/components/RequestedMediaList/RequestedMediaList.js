/* eslint-disable no-unused-vars */
import React from 'react';
import PropTypes from 'prop-types';
import './RequestedMediaList.less';
import { useDispatch, useSelector } from 'react-redux';

function RequestedMediaList(props) {
    const dispatch = useDispatch()
    const state = useSelector(state => state)

    // loops though fetch media list and renders requested MediaList component so user can see what has been requested
    const RequestedMediaListItems = () => {
        let mediaList = <div></div>;
        if (state.mediaResults && state.mediaResults.length > 0) {
            mediaList = state.mediaResults.map(result => {
                return (
                    <div
                        className="requestedMediaItemContainer"
                        key={result.id}
                        value={result.title}
                    >
                        <img
                            className="requestedMediaItemImg"
                            onClick={() => (props.openModal(result))}
                            src={"https://image.tmdb.org/t/p/w1280/" + result.posterPath}
                            onError={(e) => { e.target.src = "/NoImagePlaceholder.png" }}
                        />
                        {result.queueStatus && (
                            <div className="requestedMediaItemStatus">
                                {result.queueStatus}
                            </div>
                        )}
                    </div>
                )
            });
        }
        return <div>{mediaList ? <div >{mediaList}</div> : null}</div>;
    }
    return (
        <div className="row requestedMediaRow">
            <div className="requestedMediaListContainer">
                <div className="requestedMediaListTitle">Coming Soon</div>
                <RequestedMediaListItems />
            </div>
        </div>
    );
}

RequestedMediaList.propTypes = {
    openModal: PropTypes.func,
};

export default RequestedMediaList;