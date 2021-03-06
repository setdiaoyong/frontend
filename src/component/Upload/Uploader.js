import React, { Component } from "react";
import uploaderLoader from "../../loader";
import { connect } from "react-redux";
import { refreshFileList, refreshStorage, toggleSnackbar } from "../../actions";
import FileList from "./FileList.js";
import Auth from "../../middleware/Auth";
import UploadButton from "../Dial/Create.js";
import { basename, pathJoin } from "../../utils";

let loaded = false;

const mapStateToProps = state => {
    return {
        path: state.navigator.path,
        keywords: state.explorer.keywords
    };
};

const mapDispatchToProps = dispatch => {
    return {
        refreshFileList: () => {
            dispatch(refreshFileList());
        },
        refreshStorage: () => {
            dispatch(refreshStorage());
        },
        toggleSnackbar: (vertical, horizontal, msg, color) => {
            dispatch(toggleSnackbar(vertical, horizontal, msg, color));
        }
    };
};

class UploaderComponent extends Component {
    constructor(props) {
        super(props);
        this.state = {
            queued: 0
        };
    }

    setRef(val) {
        window.fileList = val;
    }

    cancelUpload(file) {
        this.uploader.removeFile(file);
    }

    getChunkSize(policyType) {
        if (policyType === "qiniu") {
            return 4 * 1024 * 1024;
        }
        if (policyType === "onedrive") {
            return 10 * 1024 * 1024;
        }
        return 0;
    }

    fileAdd = (up, files) => {
        let path = window.currntPath ? window.currntPath : this.props.path;
        if (
            this.props.keywords === null &&
            window.location.href
                .split("#")[1]
                .toLowerCase()
                .startsWith("/home")
        ) {
            window.fileList["openFileList"]();
            const enqueFiles = files
              // 不上传Mac下的布局文件 .DS_Store
              .filter(file => {
                const isDsStore = file.name.toLowerCase() === ".ds_store"
                if (isDsStore) {
                  up.removeFile(file)
                }
                return !isDsStore
              })
              .map(file => {
                let source = file.getSource();
                if (source.relativePath && source.relativePath !== "") {
                  file.path =  basename(
                        pathJoin([path, source.relativePath])
                    );
                    window.pathCache[file.id] = basename(
                        pathJoin([path, source.relativePath])
                    );
                } else {
                    window.pathCache[file.id] = path;
                    file.path = path;
                }
                return file
              })
            window.fileList["enQueue"](enqueFiles);
        } else {
            window.plupload.each(files, files => {
                up.removeFile(files);
            });
        }
    };

    componentWillReceiveProps({ isScriptLoaded, isScriptLoadSucceed }) {
        if (isScriptLoaded && !this.props.isScriptLoaded) {
            // load finished
            if (isScriptLoadSucceed) {
                if (loaded) {
                    return;
                }
                loaded = true;
                var user = Auth.GetUser();
                this.uploader = window.Qiniu.uploader({
                    runtimes: "html5",
                    browse_button: ["pickfiles", "pickfolder"],
                    container: "container",
                    drop_element: "container",
                    max_file_size: user.policy.maxSize === "0.00mb" ? 0 :user.policy.maxSize,
                    dragdrop: true,
                    chunk_size: this.getChunkSize(user.policy.saveType),
                    filters: {
                        mime_types:
                            (user.policy.allowedType === null || user.policy.allowedType.length === 0)
                                ? []
                                :  [{ title : "files", extensions : user.policy.allowedType.join(",") }],
                    },
                    // iOS不能多选？
                    multi_selection: true,
                    uptoken_url: "/api/v3/file/upload/credential",
                    uptoken: user.policy.saveType === "local" ? "token" : null,
                    domain: "s",
                    max_retries: 0,
                    get_new_uptoken: true,
                    auto_start: true,
                    log_level: 5,
                    init: {
                        FilesAdded: this.fileAdd,

                        BeforeUpload: function(up, file) {},
                        QueueChanged: up => {
                            this.setState({ queued: up.total.queued });
                        },
                        UploadProgress: (up, file) => {
                            window.fileList["updateStatus"](file);
                        },
                        UploadComplete: (up, file) => {
                            if (file.length === 0) {
                                return;
                            }
                            console.log(
                                "UploadComplete",
                                file[0].status,
                                file[0]
                            );
                            for (var i = 0; i < file.length; i++) {
                                if (file[i].status === 5) {
                                    window.fileList["setComplete"](file[i]);
                                }
                            }
                            // 无异步操作的策略，直接刷新
                            if (
                                user.policy.saveType !== "onedrive" &&
                                user.policy.saveType !== "cos"
                            ) {
                                this.props.refreshFileList();
                                this.props.refreshStorage();
                            }
                        },
                        Fresh: () => {
                            this.props.refreshFileList();
                            this.props.refreshStorage();
                        },
                        FileUploaded: function(up, file, info) {},
                        Error: (up, err, errTip) => {
                            window.fileList["openFileList"]();
                            window.fileList["setError"](err.file, errTip);
                        },
                        FilesRemoved: (up, files) => {}
                    }
                });
                // this.fileList["openFileList"]();
            } else this.onError();
        }
    }

    onError() {}

    openFileList = () => {
        window.fileList["openFileList"]();
    };

    render() {
        return (
            <div>
                <FileList
                    inRef={this.setRef.bind(this)}
                    cancelUpload={this.cancelUpload.bind(this)}
                />
                {this.props.keywords === null && (
                    <UploadButton
                        Queued={this.state.queued}
                        openFileList={this.openFileList}
                    />
                )}
            </div>
        );
    }
}

const Uploader = connect(mapStateToProps, mapDispatchToProps, null, {
    forwardRef: true
})(uploaderLoader()(UploaderComponent));

export default Uploader;
