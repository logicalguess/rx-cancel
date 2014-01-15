;(function () {

    function promiseToObservable(promiseProvider, procFn) {
        return function() {
            var obs = Rx.Observable.fromPromise(promiseProvider.apply(this, arguments));
            if (procFn) {
                obs = obs.select(procFn)
            }
            return obs;
        };
    }

    function createObservableFunction(context) {
        return function(functionName, cleanup, listener) {

            return Rx.Observable.create(function (observer) {
                context[functionName] = function () {
                    if (listener) {
                        observer.onNext(listener.apply(this, arguments));
                    } else if (arguments.length === 1) {
                        observer.onNext(arguments[0]);
                    } else {
                        observer.onNext(arguments);
                    }
                };

                return function () {
                    // Remove our listener function from the scope.
                    delete context[functionName];
                    if (cleanup) cleanup();
                };
            });
        }
    }

    function createFlow(context, fnName, input, output, promiseProvider, procFn) {
        createObservableFunction(context)(fnName)
            .map(function () { return context[input]; })
            .flatMapLatest(promiseToObservable(promiseProvider, procFn))
            .subscribe(function(results) {
                context[output] = results;
            });
    }

    angular.module('example', ['ngRoute'])
        .config(function ($routeProvider) {

            var dataProvider = function(http, term) {
                return http({
                    url: "http://en.wikipedia.org/w/api.php?&callback=JSON_CALLBACK",
                    method: "jsonp",
                    params: {
                        action: "opensearch",
                        search: term,
                        format: "json"
                    }
                });
            };

            $routeProvider.when('/search/:term', {
                templateUrl: 'views/results.html',
                resolve: {
                    results: function ($http, $route) {
                        // returning a promise would delay the controller instantiation until the promise is resolved
                        //return dataProvider($http, $route.current.params.term);


                        var procFn = function(results){
                            return results.data[1]
                        };
                        var dataObservable = promiseToObservable(dataProvider, procFn)($http, $route.current.params.term);

                        return  dataObservable;
                    }
                },
                controller: 'AppCtrl'
            });

            $routeProvider.when('/search/delay/:term', {
                templateUrl: 'views/results.html',
                resolve: {
                    results: function ($http, $route) {
                        // returning a promise would delay the controller instantiation until the promise is resolved
                        //return dataProvider($http, $route.current.params.term);


                        var procFn = function(results){
                            return results.data[1]
                        };
                        var dataObservable = promiseToObservable(dataProvider, procFn)($http, $route.current.params.term);

                        return  dataObservable.delay(1500);
                    }
                },
                controller: 'AppCtrl'
            });

            $routeProvider.when('/search/error/:term', {
                templateUrl: 'views/results.html',
                resolve: {
                    results: function ($http, $route) {
                        var errorObservable = Rx.Observable.throw(new Error('error!'));

                        return  errorObservable;
                    }
                },
                controller: 'AppCtrl'
            });

            $routeProvider.when('/search/retry/:term', {
                templateUrl: 'views/results.html',
                resolve: {
                    results: function ($http, $route) {

                        var procFn = function(results){
                            return results.data[1]
                        };
                        var dataObservable = promiseToObservable(dataProvider, procFn)($http, $route.current.params.term);
                        return dataObservable.catch(dataObservable);
                    }
                },
                controller: 'AppCtrl'
            });

            $routeProvider.otherwise({
                templateUrl: 'views/default.html'
            });
        })
        .controller('AppCtrl', function ($scope, $http, results) {

            //$scope.results = results.data[1];



            $scope.safeApply = function(fn) {
                var phase = this.$root.$$phase;
                if(phase == '$apply' || phase == '$digest') {
                    if(fn && (typeof(fn) === 'function')) {
                        fn();
                    }
                } else {
                    this.$apply(fn);
                }
            };

            $scope.status = 'Loading...';

            $scope.showCancel = true;

            var cancelObservable = createObservableFunction($scope)('cancel', function(){
                $scope.showCancel = false;
            }).map(function () {
                    return 'Cancel';
                });

            var subscription = cancelObservable.amb(results).subscribe(function (evt) {
                $scope.safeApply(function(){
                    if (evt === 'Cancel') {
                        $scope.status = 'Canceled';
                        $scope.showCancel = false;
                    }
                    else {
                        $scope.results = evt;
                    }
                });
            }, function (err) {
                $scope.safeApply(function(){
                    $scope.status = '' + err;
                });
            }, function () {
                $scope.safeApply(function(){
                    $scope.status = 'Done';
                });
            });
        });

}.call());