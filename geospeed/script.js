function geoFindMe() {
    var output = document.getElementById("out");

    if (!navigator.geolocation) {
        output.innerHTML = "<p>Geolocation is not supported by your browser</p>";
        return;
    }

    function success(position) {
        var latitude = position.coords.latitude;
        var longitude = position.coords.longitude;

        var latitude2;
        var longitude2;

        var speed;

        setInterval(function () {
            setTimeout(function () {
                latitude2 = position.coords.latitude;
                longitude2 = position.coords.longitude;
            }, 5000);
            speed = Math.sqrt(((latitude - latitude2) ^ 2 + (longitude - longitude2) ^ 2) * 73 * 720);

            console.log('1  ' + latitude);
            console.log('1  ' + latitude2);

            output.innerHTML = '<p>Latitude is ' + latitude + '° <br>Longitude is ' + longitude + '°</p>' + '<br>Speed is: ' + speed;

            latitude = latitude2;
            longitude = longitude2;
        }, 6000);

    }

    function error() {
        output.innerHTML = "Unable to retrieve your location";
    }

    output.innerHTML = "<p>Locating…</p>";



    navigator.geolocation.getCurrentPosition(success, error);

}
