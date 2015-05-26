function PerfController($scope, $window, $http, $compile){
  var numericFilter = function(x){
    return !isNaN(parseInt(x))
  }
  $scope.conf = $window.plugins["perf"]
  $scope.task = $window.task_data
  $scope.currentSample
  $scope.perftab=1
  $scope.getThreadKeys = function(r){
    var keys = _.uniq(_.filter(_.flatten(_.map(r, function(x){ return _.keys(x.results) }), true), numericFilter))
    return keys
  }

  $scope.getCompareColor =function(){
    return "black"
  }

  $scope.getCompareDescription = function(trendSample, taskSample){
    trendSample
    return ""
  }

  $scope.getMax = function(r){
    return _.max(_.filter(_.pluck(_.values(r), 'ops_per_sec'), numericFilter))

  }
  if($scope.conf.enabled){

    // Populate the graph and table for this task
    $http.get("/plugin/json/task/" + $scope.task.id + "/")
      .success(function(d){
        $scope.sample = d
        var w = 700
        var bw = 1
        var h = 100
        setTimeout(function(){
          for(var i=0;i<$scope.sample.data.results.length;i++){
            testname = $scope.sample.data.results[i].name
            series = $scope.sample.data.results[i].results
            var keys = _.filter(_.keys($scope.sample.data.results[i].results), numericFilter)
            var threadsVsOps = []
            for(var j=0;j<keys.length;j++){
              threadsVsOps.push({x:j, y:$scope.sample.data.results[i].results[keys[j]].ops_per_sec})
            }

            var graph = new Rickshaw.Graph( {
              element: document.querySelector("#chart-" + $scope.task.id + "-" + i), 
              width: 150, 
              height: 50, 
              renderer:"bar",
              series: [{
                color: 'lightblue',
                data: threadsVsOps,
              }]
            })

            var yAxis = new Rickshaw.Graph.Axis.Y({ graph: graph, ticks:2 });
            var x_axis = new Rickshaw.Graph.Axis.X({ 
              graph: graph, 
              orientation:"top",
              tickValues:_.map(keys, function(k){return parseInt(k)-.5}), 
              tickFormat:function(t){return Math.floor(t)+1}
            })
            graph.render();
          }},0)
      })

    function generateSummary(sample){
      var tout = $('<table></table>')
      for(k in sample){
        var row = $('<tr>')
        row.append($('<th></th>').text(k))
        row.append($('<td></td>').text(sample[k]))
        tout.append(row)
      }
      return tout
    }  

    $scope.testSeriesByName = {}
    $scope.testSeriesKeys = []
    // Populate the trend data
    $http.get("/plugin/json/history/" + $scope.task.id + "/perf")
      .success(function(d){
        console.log(d.length)
        console.log(d)
        for (var i = 0; i < d.length; i++) {
          for (var j = 0; j < d[i].data.results.length; j++) {
            var name = d[i].data.results[j].name
            if (!(name in $scope.testSeriesByName)) {
              $scope.testSeriesByName[name] = []
            }
            var rec = d[i].data.results[j]
            var maxops = _.max(_.pluck(_.filter(_.values(rec.results), function(x){return typeof(x)=="object"}), "ops_per_sec"))
            $scope.testSeriesByName[name].push({
              task_id: d[i].task_id,
              "ops_per_sec": maxops,
              order: d[i].order
            })
          }
        }

        for(key in $scope.testSeriesByName){
          $scope.testSeriesByName[key] = _.sortBy($scope.testSeriesByName[key], 'order')
          $scope.testSeriesKeys.unshift(key)
        }
    
        setTimeout(function(){
          for(var i=0;i<$scope.testSeriesKeys.length;i++){
            var key = $scope.testSeriesKeys[i]
            console.log($scope.testSeriesByName[key])
             var w = 400
             var bw = 3
             var h = 100
             console.log("putting graph in", "#perf-trendchart-" + $scope.task.id + "-" + key)
             var svg = d3.select("#perf-trendchart-" + $scope.task.id + "-" + i)
                  .append("svg")
                  .attr('class',"series")
                  .attr("width", 800)
                  .attr("height", h);
             var series = $scope.testSeriesByName[key]
             var ops = _.pluck(series, 'ops_per_sec')

            var y = d3.scale.linear()
              .domain([0, d3.max(ops)])
              .range([h, 0]);
            var x = d3.scale.linear()
              .domain([0, ops.length-1])
              .range([0, w]);

             svg.selectAll('rect')
               .data(series)
                 .enter()
               .append('rect')
                 .attr('stroke', function(d){
                    if(d.task_id == $scope.task.id){
                      return 'green'
                    }
                    return '#ccc'
                 })
                 .attr('fill', '#eee')
                 .attr('x', function(d,i){return x(i)})
                 .attr('y', function(d){return y(d.ops_per_sec)})
                 .attr('width',bw)
                 .attr('height', function(d){return y(0) - y(d.ops_per_sec)})//function(d){(d.ops_per_sec/(maxOps-minOps))*100})
                 .on('mouseover', function(d) {
                    if($scope.currentSample != null && $scope.currentSample._svgel != null){
                      d3.select($scope.currentSample._svgel).attr('fill',"#eee")
                    }
                    d3.select(this).attr('fill',"lightblue")
                    $scope.currentSample = d
                    $scope.currentSample._svgel = this
                    $scope.$apply()
                 })

                 var avgOpsPerSec = d3.mean(ops)
                 var avgLine = d3.svg.line()
                     .x(function(d, i){return x(i)})
                     .y(function(d){ return y(avgOpsPerSec)})

                 svg.append("line")
                    .attr("stroke","#6666FF")
                    .attr("stroke-width","1")
                    .attr("stroke-dasharray","5,5")
                    .attr("class", "mean-line")
                    .attr( {x1:x(0), x2:x(w), y1:y(avgOpsPerSec), y2:y(avgOpsPerSec)})


            var padding=30
             var yAxis = d3.svg.axis()
                  .scale(y)
                  .orient("left")
                  .ticks(5);
             svg.append("g")
                .attr("class", "axis")
                //.attr("transform", "translate(" + padding + ",0)")
                .call(yAxis);
          }
        })
      })
  }
}

