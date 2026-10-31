// DistanceBetweenObjects.js
// Version: 0.1.0
// Event: Lens Initialized
// Description: Provides a way to print, or get from API, distance between two scene objects
//
// ---- EXAMPLE USAGE ----
// In another script:
// var objectDistance = script.distanceBetweenObjects.get();

// @input SceneObject objectA
// @input SceneObject objectB
// @input bool printDistance

// @ui {"widget":"separator"}
// @input bool multiplyPositions
// @input vec3 multiplier = {1.0,1.0,1.0} {"showIf":"multiplyPositions"}

// @ui {"widget":"separator"}
// @input bool mapDistance
// @input float minDistance {"showIf":"mapDistance"}
// @input float maxDistance {"showIf":"mapDistance"}
// @input float mappedMin = 0 {"showIf":"mapDistance"}
// @input float mappedMax = 1 {"showIf":"mapDistance"}
// @input bool printMapDist

function getDistance() {
        
    const pos1 = script.objectA.getTransform().getWorldPosition();
    const pos2 = script.objectB.getTransform().getWorldPosition();
    
    if (script.multiplyPositions) {
        pos1 = pos1.mult(script.multiplier);
        pos2 = pos2.mult(script.multiplier);
    }

    var distance = pos1.distance(pos2);
    
    if (script.printDistance) {
        print(distance);
    }
    
    if (script.mapDistance) {
        distance = mapNumberRange(distance, script.minDistance, script.maxDistance, script.mappedMin, script.mappedMax);
    }
    
    if (script.printMapDist) {
        print(distance);
    }
    
    return distance;
}

function mapNumberRange (number, inMin, inMax, mappedMin, mappedMax) {
    return (number - inMin) * (mappedMax - mappedMin) / (inMax - inMin) + mappedMin;
}

if (script.printDistance || script.printMapDist) {
    script.createEvent("UpdateEvent").bind(getDistance);
}

/*-----------------------------------------------------------------------------------
Exposed APIs
-----------------------------------------------------------------------------------*/
script.get = getDistance;