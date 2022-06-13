// eslint-disable-next-line no-unused-vars
import React from 'react';
import PropTypes from 'prop-types';
import './Dialog.less';

const Detail = (content) => {
    return (
        <div className='dialogContent'>
            {content}
        </div>
    )
}

const Detail2 = (title, content) => {
    return (
        <h2 className='dialogTitle'>
            {title}: {content}
        </h2>
    )
}

function Modal(props) {
    return (
        <div className="row dialogContainer">
            <form className="modal-container"
                style={{
                    padding: '20px',
                    backgroundColor: '#414141',
                    borderRadius: '25px',
                    fontSize: '1.75rem'
                }}
            >
                <div className="row">
                    {Detail(props.title)}
                </div>
                <div className="row">
                    <div className="col-xs-12 col-s-12 col-12"
                        style={{
                            padding: "20px 0",
                            textAlign: "center",
                        }}
                    >
                        {props.releaseDate && (
                            Detail2('Released', props.releaseDate)
                        )}
                        {props.mediaType && (
                            Detail2('Media Type', props.mediaType)
                        )}
                        {props.queueStatus && (
                            Detail2('Status', props.queueStatus)
                        )}
                        {props.queueMessage && (
                            Detail2('Status Details', props.queueMessage)
                        )}
                    </div>
                </div>
                {/* Buttons */}
                <div className="row">
                    <div className="col-xs-12 col-s-12 col-12"
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                        }}
                    >
                        <input
                            type="button"
                            value="Close"
                            onClick={() => { props.onClose() }}
                        >
                        </input>
                    </div>
                </div>
            </form>
        </div>
    );
}

Modal.propTypes = {
    open: PropTypes.bool.isRequired,
    title: PropTypes.string,
    id: PropTypes.string,
    createdAt: PropTypes.string,
    posterPath: PropTypes.string,
    releaseDate: PropTypes.string,
    originalTitle: PropTypes.string,
    adult: PropTypes.bool,
    mediaType: PropTypes.string,
    queueStatus: PropTypes.string,
    queueMessage: PropTypes.string,
    requestUser: PropTypes.string,
    handleRequestSubmit: PropTypes.func,
    onModalUpdate: PropTypes.func,
    onClose: PropTypes.func,
    setModal: PropTypes.func,
    setState: PropTypes.func,
    clearModal: PropTypes.func,
};

export default Modal;