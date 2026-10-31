// LookAroundController.js
// Version: 0.0.4
// Event: Lens Initialized
// Description: Enables and disables object depending on whether we are on front/back camera

function onFrontCamEvent(eventData) {
    for (var i = 0; i < script.getSceneObject().getChildrenCount(); i++) {
        var childObject = script.getSceneObject().getChild(i);
        if (childObject) {
            childObject.enabled = false;
        }
    }
}
var cameraFrontEvent = script.createEvent("CameraFrontEvent");
cameraFrontEvent.bind(onFrontCamEvent);

function onBackCamEvent(eventData) {
    print("Important: Make sure to have a Device Tracking Component set to Rotation")
    for (var i = 0; i < script.getSceneObject().getChildrenCount(); i++) {
        var childObject = script.getSceneObject().getChild(i);
        if (childObject) {
            childObject.enabled = true;
        }
    }
}
var cameraBackEvent = script.createEvent("CameraBackEvent");
cameraBackEvent.bind(onBackCamEvent);