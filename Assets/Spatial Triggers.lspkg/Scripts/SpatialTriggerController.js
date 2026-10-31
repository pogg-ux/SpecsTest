
// @input Asset.ObjectPrefab[] stations 
// @input  int perStationCount = 1
// @input float spawnRadius = 50;
// @input bool orientStationsToCenter = true;
// @input float detectionRadiusSqrt = 100;

// @input SceneObject cameraObject
// @input bool spawnAutomatically

var stationObjs  = []
var isInStation = false;
var camTransform = script.cameraObject.getTransform();
var detectionRadius = script.detectionRadiusSqrt * script.detectionRadiusSqrt;
var detectionExitSq = detectionRadius + script.detectionRadiusSqrt
var centerTransform = script.getSceneObject().getTransform();

function spawnInCircle(prefabs, countOfEachPrefab, centerTrans, radius, orientToCenter) {

    var spawnedObjects = [];    
    
    var totalObjectCount = (countOfEachPrefab * prefabs.length);
    if(totalObjectCount < 1) 
        return;
    var offset = 2 * Math.PI / totalObjectCount;
    var angle = offset; 
    
    var centerRot = centerTrans.getWorldRotation();
    var centerPos = centerTrans.getWorldPosition();
    
    for (var i = 0; i < totalObjectCount; ++i) {
        
        var directionVector = new vec3(Math.cos(angle), 0, Math.sin(angle));
        directionVector = directionVector.uniformScale(radius) 
        directionVector = centerRot.multiplyVec3(directionVector);      
                
        angle += offset;
        
        var sceneObj = prefabs[i % prefabs.length].instantiate(null);
        
        spawnedObjects[i]  = [sceneObj.getTransform(), false]
        
        var transform = spawnedObjects[i][0];
        transform.setWorldPosition(centerTrans.getWorldPosition().add(directionVector));
        
        if (orientToCenter) {
            var currentRot = transform.getWorldRotation();
            var targetRot = quat.rotationFromTo(transform.forward,directionVector);
            targetRot = targetRot.multiply(currentRot)  
            transform.setWorldRotation(targetRot);
        }
             
    }
    return spawnedObjects;
}

// Listen for isLocalizedEvent and then this will be moved to that location
script.spawnStations = function () {
    stationObjs = spawnInCircle(script.stations, script.perStationCount, 
                  centerTransform, script.spawnRadius, 
                  script.orientStationsToCenter)
}

script.stationEntered = function(stationIndex) {
    stationObjs[stationIndex][1] = true;
    isInStation = true;
    global.behaviorSystem.sendCustomTrigger("station_" + stationIndex + "_entered");
}

script.stationDeparted = function(stationIndex) {
    stationObjs[stationIndex][1] = false;
    isInStation = false;
    global.behaviorSystem.sendCustomTrigger("station_" + stationIndex + "_exited");
}

function horizontalDistanceSq(pointA, pointB) {
    var subVec = pointA.sub(pointB);
    subVec.y = 0;
    return subVec.lengthSquared;
}

function onUpdateEvent(eventData) {
    if (script.cameraObject) {
        // Distance between the camera and the object is used to determine when to trigger the approach animations
        var camPos = camTransform.getWorldPosition();

        stationObjs.forEach(function (station, index) {
           var stationPos =  station[0].getWorldPosition();
           var hDistance = horizontalDistanceSq(camPos,stationPos)
            if(hDistance < detectionRadius) {
                if (station[1] == false) {
                    script.stationEntered(index);
                }
                return; // Can only be in one station at a time 
                
            } else if (station[1] == true &&  hDistance > detectionExitSq) {
                script.stationDeparted(index);
            }
       
        })
    }
}

function checkInputs(){
    if(!script.stations || script.stations.length === 0){
        print("ERROR: Stations input not configured");
        return false;
    }
    var allSet = true;
    script.stations.forEach(function(station, index){
        if(!station){
            allSet = false;
            print("ERROR: Station input #" + index + " is not configured correctly");
        }
    });
    return allSet;
}

function init(){
    var updateEvent = script.createEvent("UpdateEvent");
    updateEvent.bind(onUpdateEvent);
    if(script.spawnAutomatically){
        script.spawnStations();
    }
}

if(checkInputs()){
    init();
}
