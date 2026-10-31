// OffsceenLocator.js
// Version: 0.0.1
// Event: Initialized
// Description: Indicates a direction to follow to reveal an object out of the screen frame.
// Pack: Refinement Pack

//@input string mode = "center" {"widget":"combobox", "values":[{"label":"Show Indicator at the screen center", "value":"center"}, {"label":"Show Indicator at the screen edge", "value":"edge"}]}
//@input SceneObject locator {"label":"Object To Locate"}
//@input Component.ScreenTransform indicator
//@input float edgeBound = 0.8
//@ui {"widget":"separator"}
//@input Component.Camera camera


function update() {
    var wPos = script.locator.getTransform().getWorldPosition();
    var sPos = script.camera.worldSpaceToScreenSpace(wPos);
    var cMat = script.camera.getSceneObject().getTransform().getInvertedWorldTransform();
    var lPos = cMat.multiplyPoint(wPos);

    var front = lPos.z < 0;
    if (front && sPos.x > 0 && sPos.x < 1 && sPos.y > 0 && sPos.y < 1) {
        script.indicator.getSceneObject().enabled = false;
        return;
    }

    if (script.mode == "center") {
        rotateIndicator(sPos, front);
    } else {
        moveIndicator(sPos, front);
    }
}


function moveIndicator(sPos, front) {
    if (front) {
        if (sPos.x > 1) {
            moveRight();
        } else if (sPos.x < 0) {
            moveLeft();
        } else if (sPos.y > 1) {
            moveBottom();
        } else if (sPos.y < 0) {
            moveTop();
        }
    } else {
        if (sPos.x > 1) {
            moveLeft();
        } else if (sPos.x < 0) {
            moveRight();
        } else if (sPos.y > 1) {
            moveTop();
        } else if (sPos.y < 0) {
            moveBottom();
        }
    }
    script.indicator.getSceneObject().enabled = true;
}


function moveRight() {
    script.indicator.anchors.setCenter(new vec2(script.edgeBound, 0));
    script.indicator.rotation = quat.fromEulerAngles(0, 0, 0);
}


function moveLeft() {
    script.indicator.anchors.setCenter(new vec2(-script.edgeBound, 0));
    script.indicator.rotation = quat.fromEulerAngles(0, 0, Math.PI);
}


function moveTop() {
    script.indicator.anchors.setCenter(new vec2(0, script.edgeBound));
    script.indicator.rotation = quat.fromEulerAngles(0, 0, Math.PI * 0.5);
}


function moveBottom() {
    script.indicator.anchors.setCenter(new vec2(0, -script.edgeBound));
    script.indicator.rotation = quat.fromEulerAngles(0, 0, -Math.PI * 0.5);
}


function rotateIndicator(pos, front) {
    var x = pos.x - 0.5;
    var y = pos.y - 0.5;
    var ang = Math.atan(y / x);
    if (front) {
        if (x < 0) {
            ang += Math.PI;
        }
    } else {
        if (x > 0) {
            ang += Math.PI;
        }
    }
    script.indicator.rotation = quat.fromEulerAngles(0, 0, -ang);
    script.indicator.getSceneObject().enabled = true;
}


function init() {
    // Check inputs
    if (!script.camera) {
        print("OffscreenLocator, ERROR: Please set camera!");
        return;
    }
    if (!script.locator) {
        print("OffscreenLocator, ERROR: Please set locator to track!");
        return;
    }
    if (!script.indicator) {
        print("OffscreenLocator, ERROR: Please set indicator to show!");
        return;
    }

    // Setup pivot
    if (script.mode == "center") {
        script.indicator.pivot = new vec2(-1, 0);
        script.indicator.anchors.setCenter(new vec2(0.1, 0));
    } else {
        script.indicator.pivot = new vec2(0, 0);
    }

    // Make event
    script.createEvent("UpdateEvent").bind(update);
}


init();