function geoFindMe() {
    var output = document.getElementById("out");

    if (!navigator.geolocation) {
        output.innerHTML = "<p>Geolocation is not supported by your browser</p>";
        return;
    }
    var latitude;
    var longitude;

    var latitude2;
    var longitude2;

    var speed;

    function success(position) {
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
        setTimeout(function () {
            latitude2 = position.coords.latitude;
            longitude2 = position.coords.longitude;
            speed = Math.sqrt(((latitude - latitude2) ^ 2 + (longitude - longitude2) ^ 2) * 73 * 1800);
            output.innerHTML = '<p>Latitude is ' + latitude + '° <br>Longitude is ' + longitude + '°</p>' + '<br>Speed is: ' + speed;

            latitude = latitude2;
            longitude = longitude2;
        }, 2000);



        


    }

    function error() {
        output.innerHTML = "Unable to retrieve your location";
    }

    output.innerHTML = "<p>Locating…</p>";
    
    setInterval(function(){
        navigator.geolocation.getCurrentPosition(success, error);
    }, 2000);

}
