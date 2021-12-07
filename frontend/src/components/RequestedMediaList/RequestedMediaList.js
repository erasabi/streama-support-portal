import React from 'react';
import PropTypes from 'prop-types';
import './RequestedMediaList.less';

function RequestedMediaList(props) {
    // loops though fetch media list and renders requested MediaList component so user can see what has been requested
    const RequestedMediaListItems = () => {
        let mediaList = <div></div>;
        if (props.mediaResults && props.mediaResults.length > 0) {
        mediaList = props.mediaResults.map(result => {
            return (
                <div
                    className="col-xs-3 col-s-2 col-2"
                    key={result.id}
                    value={result.title}
                    style={{ width: '160px' }}
                >
                <img
                    className="requestedMediaItem"
                    onClick={() => (props.openModal(result))}
                    src={"https://image.tmdb.org/t/p/w1280/" + result.posterPath}
                    onError={(e) => { e.target.src = "/NoImagePlaceholder.png" }}
                />
                { result.queueStatus && (
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
        <div className="col-s-12 col-12 requestedMediaList">
            <div className="requestedMediaListTitle">Coming Soon</div>
            <RequestedMediaListItems />
        </div>
        </div>
    );
}

RequestedMediaList.propTypes = {
  mediaResults: PropTypes.array,
  openModal: PropTypes.func,
};

export default RequestedMediaList;