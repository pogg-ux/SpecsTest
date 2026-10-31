// LensCloudPersistentCloudStorage.js
// Version: 0.1.0
// Event: Lens Initialized
// Description: Example of using Persistent Cloud Storage. You can store data for the
// current users only, or for everyone in a multiplayer session. Useful for creating
// experiences where you want the user to return.
//
// Try using this with the ConnectedLensesSession Example in the Asset Library.

/*-----------------------------------------------------------------------------------
You can modify this file directly, or use API to hook in from another script:

script.multiplayerSession.onStarterConnectedToMultiplayer = function (_session) {
    session = _session;
    script.cloudStorage.createCloudStore(session, onCloudStoreReady);
}

// Once we connect to session, we need to initialize exercise counts for the cloud
function onCloudStoreReady(store) {
    // We will initialize value for the store
    script.cloudStorage.initializeValueInScope(StorageScope.Session, "myKey", 0, function() {
        print("Initialized Value!")
    });
}

script.createEvent("TapEvent").bind(function() {
    script.cloudStorage.modifyValueInScope(StorageScope.Session, "myKey", 777);
})

-----------------------------------------------------------------------------------*/

// @input Asset.CloudStorageModule cloudStorageModule

/*-----------------------------------------------------------------------------------
Create the Cloud Store
-----------------------------------------------------------------------------------*/

function createCloudStore(session, callback) {
    const cloudStorageOptions = CloudStorageOptions.create();

    // We might want to pass in a session if we want
    // other people to have access to the Cloud Store
    if (session) {
        cloudStorageOptions.session = session;
    }

    script.cloudStorageModule.getCloudStore(
        cloudStorageOptions, 
        onCloudStoreReady.bind({callback: callback}), 
        onError
    );    
}

function onError(code, message) {
    print('Error: ' + code + ' ' + message);
}

function onCloudStoreReady(store) {
    script.store = store;

    if (this.callback) {this.callback(store);}
}

/*-----------------------------------------------------------------------------------
Handle Store
-----------------------------------------------------------------------------------*/

function getValueInScope(scope, key, callback) {
    const getOptions = CloudStorageReadOptions.create();
    getOptions.scope = scope;

    script.store.getValue(
        key,
        getOptions,
        function onSuccess(key, value) {
            if (callback) {
                callback(value);
            }
        },
        onError
    );
 }

function modifyValueInScope(scope, key, value, callback) {
    const writeOptions = CloudStorageWriteOptions.create();
    writeOptions.scope = scope;

    script.store.setValue(
        key,
        value,
        writeOptions,
        function onSuccess() {
            if (callback) {
                callback(value);
            }
        },
        onError
    );
}

function listValuesInScope(scope, callback) {

    const listOptions = CloudStorageListOptions.create();
    listOptions.scope = scope;

    script.store.listValues(
        listOptions,
        function(results, cursor) {
            // Results are returned as a list of [key, value] tuples
            for (var i = 0; i < results.length; ++i) {
                var key = results[i][0];
                var value = results[i][1];
                print(' - key: ' + key + ' value: ' + value);
            }
        
            if (callback) {
                callback(results, cursor);
            }
        },
        onError
    );

}

/*-----------------------------------------------------------------------------------
Example additional helpers
-----------------------------------------------------------------------------------*/

function hasValueInScope(scope, storeKey, callback) {
    function onGetResults(results) {
        var doesExist = false;

        for(var i = 0; i < results.length; i++) {
            if (results[i][0] === storeKey) {
                doesExist = true;
                break;
            }
        }
        
        if (callback) callback(doesExist);
    }

    listValuesInScope(scope, onGetResults);
}

function initializeValueInScope(scope, key, value, callback) {
    hasValueInScope(scope, key, function(doesExist) {
        if (!doesExist) {
            modifyValueInScope(scope, key, value, callback);
        }
    });
}

/*-----------------------------------------------------------------------------------
Exposed APIs
-----------------------------------------------------------------------------------*/
script.createCloudStore = createCloudStore;
script.getValueInScope = getValueInScope;
script.modifyValueInScope = modifyValueInScope;
script.listValuesInScope = listValuesInScope;

// Additional helpers this script provides
script.hasValueInScope = hasValueInScope;
script.initializeValueInScope = initializeValueInScope;
