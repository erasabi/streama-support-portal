import React, { useContext, useState } from 'react';
import PropTypes from 'prop-types';
import { deleteMediaRequest, updateMediaRequest } from '../../handlers/handle-media-requests';
import { userContext } from '../../context/user';
import Dialog from '../Dialog/Dialog';
import './Modal.less';

function AdminModal(props) {
    const [dialog, setDialog] = useState({
        queueStatus: props.queueStatus || '',
        queueMessage: props.queueMessage || '',
    });

    // {
    //     id: req.body.id,
    //     title: req.body.title || '',
    //     posterPath: req.body.posterPath || '',
    //     createdAt: req.body.createdAt || '',
    //     originalTitle: req.body.originalTitle || null,
    //     releaseDate: req.body.releaseDate || null,
    //     adult: req.body.adult || false,
    //     mediaType: req.body.mediaType || null,
    //     queueStatus: req.body.queueStatus || null,
    //     queueMessage: req.body.queueMessage || null,
    //     requestUser: req.body.requestUser || null,
    // }

    return (
        <div className="row modalLayout">
          <form className="modalContainer">
            <div className="row">
                <div className="col-xs-12 col-s-12 col-12">
                    <div className="modalTitle">{props.title}</div>
                </div>
            </div>
            <div 
                className="col-xs-12 col-s-12 col-12"
                style={{ padding: "0" }}
            >
                {props.requestUser && (
                    <div className="row">
                        <h2 className="modalContent">Requested body: {props.requestUser}</h2>
                    </div>
                )}
                {props.createdAt && (
                    <div className="row">
                        <h2 className="modalContent">Created: {props.createdAt}</h2>
                    </div>
                )}
                {props.releaseDate && (
                    <div className="row">
                            <h2 className="modalContent">Released: {props.releaseDate}</h2>
                    </div>
                )}
                {props.mediaType && (
                    <div className="row">
                            <h2 className="modalContent">Media Type: {props.mediaType}</h2>
                    </div>
                )}
            </div>
            {/* Queue Status */}
            <div 
                className="row"
                style={{ padding: '5px 0px'}}
            >
                <div className="col-xs-12 col-s-2 col-2 modalContentUpdatable" style={{ padding: '0px 0px' }}>Queue Status:</div>
                <div className="col-xs-12 col-s-10 col-8" style={{ padding: '0px 0px' }}>
                    <input
                        type="text"
                        autoComplete="off"
                        id="titleText"
                        value={dialog.queueStatus}
                        placeholder=""
                        style={{
                            backgroundColor: '#b5b4b4', borderColor: (props.queueStatus && !props.queueStatus.Empty) ? "#ff2828" : "" 
                        }}
                            onChange={(e) => (setDialog({ ...dialog, queueStatus: e.target.value}))}
                    />
                </div>
            </div>
            {/* Status Details */}
            <div className="row" style={{ padding: '5px 0px'}}>
                <div className="col-xs-12 col-s-2 col-2 modalContentUpdatable" style={{ padding: '0px 0px' }}>Status Details:</div>
                <div className="col-xs-12 col-s-10 col-8" style={{ padding: '0px 0px' }}>
                    <input
                        type="text"
                        autoComplete="off"
                        id="titleText"
                        value={dialog.queueMessage}
                        placeholder=""
                        style={{
                            backgroundColor: '#b5b4b4', borderColor: (props.queueMessage && !props.queueMessage.Empty) ? "#ff2828" : "" 
                        }}
                        onChange={(e) => (setDialog({ ...dialog, queueMessage: e.target.value}))}
                    />
                </div>
            </div>
            {/* Buttons */}
            <div className="row">
                <div className="col-xs-4 col-s-4 col-4 buttonCancel">
                    <input
                        type="button"
                        value="Cancel"
                        onClick={() => {props.onClose()}}
                    >
                    </input>
                </div>
                <div className="col-xs-4 col-s-4 col-4 buttonDelete">
                    <input
                        type="button"
                        value="Delete"
                        onClick={() => {
                            deleteMediaRequest(props, props.id);
                            props.onClose();
                        }}
                    >
                    </input>
                </div>
                <div className="col-xs-4 col-s-4 col-4 buttonUpdate">
                    <input
                        type="button"
                        value="Update"
                        onClick={() => {
                            updateMediaRequest(props, props.id, dialog);
                            props.onClose();
                        }}
                    >
                    </input>
                </div>
            </div>
          </form>
        </div>
    );
}

AdminModal.propTypes = {
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

function Modal(props) {
    const userProfile = useContext(userContext);
    return (
        (userProfile?.user?.authorities?.filter(e => e.displayName === 'Admin').length > 0) 
            ? AdminModal(props) 
            : Dialog(props)
    );
}

export default Modal;