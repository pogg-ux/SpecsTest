// TweenWaypoint.js
// Author: Bennyp3333
// Version: 0.0.1
// Event: Any Event
// Description: Runs tweens based on array of sceneObject waypoints using TweenJS

//@input SceneObject sceneObjectReference
//@input string tweenName
//@input bool playAutomatically = true
//@input int loopType = 0 {"widget":"combobox", "values":[{"label":"None", "value":0}, {"label":"Loop", "value":1}, {"label":"Ping Pong", "value":2}, {"label":"Ping Pong Once", "value":3}]}
//@ui {"widget":"separator"}
//@input int type = 0 {"widget":"combobox", "values":[{"label":"Move", "value":0}, {"label":"Scale", "value":1}, {"label":"Rotate", "value":2}]}
//@input bool constantUpdate = true
//@input SceneObject[] waypoints

//@input bool constantTime = true
//@input float time = 1.0 {"showIf": "constantTime", "showIfValue": true}
//@input float[] timePoints = {1.0, 1.0} {"showIf": "constantTime", "showIfValue": false}
//@input bool constantDelay = true
//@input float delay = 0.0 {"showIf": "constantDelay", "showIfValue": true}
//@input float[] delayPoints = {0.0, 0.0} {"showIf": "constantDelay", "showIfValue": false}
//@input bool isLocal = true
//@ui {"widget":"separator"}
//@input string easingFunction = "Quadratic" {"widget":"combobox", "values":[{"label":"Linear", "value":"Linear"}, {"label":"Quadratic", "value":"Quadratic"}, {"label":"Cubic", "value":"Cubic"}, {"label":"Quartic", "value":"Quartic"}, {"label":"Quintic", "value":"Quintic"}, {"label":"Sinusoidal", "value":"Sinusoidal"}, {"label":"Exponential", "value":"Exponential"}, {"label":"Circular", "value":"Circular"}, {"label":"Elastic", "value":"Elastic"}, {"label":"Back", "value":"Back"}, {"label":"Bounce", "value":"Bounce"}]}
//@input string easingType = "Out" {"widget":"combobox", "values":[{"label":"In", "value":"In"}, {"label":"Out", "value":"Out"}, {"label":"In / Out", "value":"InOut"}]}

// If no scene object is specified, use object the script is attached to
if( !script.sceneObjectReference )
{
    script.sceneObjectReference = script.getSceneObject();
}

// Setup external API
script.tweenObject = script.getSceneObject();
script.tweenType = "waypoint";
script.tweenName = script.tweenName;
script.time = script.time;
script.delay = script.delay;
script.startTween = startTween;
script.resetObject = resetObject;
script.tween = null;
script.type = script.type;
script.setupTween = setupTween;
script.sceneObjectReference = script.sceneObjectReference;
script.loopType = script.loopType;
script.currentWaypoint = 0;
script.nextWaypoint = 0;
script.direction = true;
script.start = null;
script.end = null;
script.startWaypoint = null;
script.endWaypoint = null;
script.playAutomatically = script.playAutomatically;

if ( global.tweenManager && global.tweenManager.addToRegistry )
{
    global.tweenManager.addToRegistry(script);
}

var holdEvent = script.createEvent("UpdateEvent");
holdEvent.bind(function (eventData)
{
    var holdValue = { "x": 1 };
    updateValue( holdValue );
});
holdEvent.enabled = false;

// Play it automatically if specified
if( script.playAutomatically )
{    
    // Start the tween
    startTween();
}

// Resets to first waypoint
function startTween()
{
    if ( !global.tweenManager )
    {
        print( "Tween Waypoint: Tween Manager not initialized. Try moving the TweenManager script to the top of the Objects Panel or changing the event on this TweenType to \"Lens Turned On\"." );
        return;
    }
    
    if ( script.waypoints.length >= 2 )
    {
        holdEvent.enabled = false;
        script.currentWaypoint = 0;
        runWaypoints();
    }
    else
    {
        print( "Tween Waypoint: Needs 2 or more waypoints" );
    }
}

// Create the tween with next waypoint and start it
function runWaypoints()
{
    // Find next waypoint
    if ( script.currentWaypoint + 1 >= script.waypoints.length || ( script.direction == false && script.currentWaypoint == 0 ) )
    {
        if ( script.loopType == 1 )
        {  
            script.nextWaypoint = 0; 
        }
        else if ( script.loopType == 2 )
        {
            script.direction = !script.direction;
            script.nextWaypoint = (script.direction) ? script.currentWaypoint + 1 : script.currentWaypoint - 1; 
        }
        else if ( script.loopType == 3 )
        {  
            script.direction = !script.direction;
            script.nextWaypoint = (script.direction) ? script.currentWaypoint : script.currentWaypoint - 1; 
        }
    }
    else
    {
        script.nextWaypoint = (script.direction) ? script.currentWaypoint + 1 : script.currentWaypoint - 1; 
    }
    
    // Stop or hold if no change
    if ( script.currentWaypoint == script.nextWaypoint ){
        if ( script.constantUpdate )
        {
            holdEvent.enabled = true;
        }
    }
    else
    {
        // Set waypoints
        script.startWaypoint = script.waypoints[script.currentWaypoint];
        script.endWaypoint = script.waypoints[script.nextWaypoint];
        
        script.tween = setupTween();

        if ( script.tween )
        {
            // Start Tween
            script.tween.start();
        }   
        
        script.currentWaypoint = script.nextWaypoint;
    }  
}

// Create the tween with passed in parameters
function setupTween()
{
    var startValue = null;

    var endValue = null;

    var tween = null;
    
    // Set the appropriate parameter based on isLocal and tweenType
    var local = script.isLocal ? "Local" : "World";

    // Set the start and end from waypoints based on the type selected
    switch ( script.type )
    {
        case 0:
            script.start = script.startWaypoint.getTransform()["get" + local + "Position"]();
            script.end = script.endWaypoint.getTransform()["get" + local + "Position"]();
            break;
        case 1:
            script.start = script.startWaypoint.getTransform()["get" + local + "Scale"]();
            script.end = script.endWaypoint.getTransform()["get" + local + "Scale"]();
            break;
        case 2:
            script.start = script.startWaypoint.getTransform()["get" + local + "Rotation"]();
            script.end = script.endWaypoint.getTransform()["get" + local + "Rotation"]();
            break;
    }

    startValue = ( script.type == 2 || script.constantUpdate ) ? {
        "x": 0
    } : {
        "x": script.start.x,
        "y": script.start.y,
        "z": script.start.z
    };

    endValue = ( script.type == 2 || script.constantUpdate ) ? {
        "x": 1
    } : {
        "x": script.end.x,
        "y": script.end.y,
        "z": script.end.z
    };
    
    // Set time and delay values if not constant
    if ( script.loopType == 1 )
    {
        script.time = (script.constantTime) ? script.time : script.timePoints[script.currentWaypoint];
    }
    else
    {
        script.time = (script.constantTime) ? script.time : script.timePoints[Math.min(script.currentWaypoint, script.nextWaypoint)];  
    }
    
    script.delay = (script.constantDelay) ? script.delay : script.delayPoints[Math.min(script.currentWaypoint)];

    // Reset object to start
    resetObject();

    // Create the tween
    tween = new TWEEN.Tween( startValue )
        .to( endValue, script.time * 1000.0 )
        .delay( script.delay * 1000.0 )
        .easing( global.tweenManager.getTweenEasingType( script.easingFunction, script.easingType ) )
        .onUpdate( updateValue )
        .onComplete( runWaypoints );
    
    if ( tween )
    {
        global.tweenManager.setTweenLoopType( tween, 0 );
        script.tween = tween;
        return tween;
    }
    else
    {
        return;
    }
}

// Resets the object to its start
function resetObject()
{
    if ( script.start == null ) {
        return;
    }

    var startValue = ( script.type == 2 || script.constantUpdate ) ? {
        "x": 0
    } : {
        "x": script.start.x,
        "y": script.start.y,
        "z": script.start.z
    };

    // Initialize transform to start value
    updateValue( startValue );
}

// Here's were the values returned by the tween are used
// to drive the transform of the SceneObject
function updateValue( value )
{   
    var DEG_TO_RAD = 0.0174533;
    var transform = script.sceneObjectReference.getTransform();
    var startTransform = script.startWaypoint.getTransform();
    var endTransform = script.endWaypoint.getTransform();
    var local = script.isLocal ? "Local" : "World";
    var type = null;
    var newValue = null;
    
    if ( script.type == 0 )
    {
        type = "Position";
        newValue = (script.constantUpdate) ? vec3.lerp(startTransform["get" + local + "Position"](), endTransform["get" + local + "Position"](), value.x) : new vec3(value.x, value.y, value.z);
    }
    else if ( script.type == 1)
    {
        type = "Scale";
        newValue = (script.constantUpdate) ? vec3.lerp(startTransform["get" + local + "Scale"](), endTransform["get" + local + "Scale"](), value.x) : new vec3(value.x, value.y, value.z);
    }
    else if ( script.type == 2 )
    {
        type = "Rotation";
        newValue = (script.constantUpdate) ?  quat.slerp(startTransform["get" + local + "Rotation"](), endTransform["get" + local + "Rotation"](), value.x) : quat.slerp(script.start, script.end, value.x);
        newValue.normalize();
    }
    transform["set" + local + type](newValue);
}