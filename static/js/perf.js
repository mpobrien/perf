function PerfController($scope, $window, $http, $compile){
  var percentColors = [
      {pct:0.0,color:{r:0xff,g:0x00,b:0}},
      {pct:0.5,color:{r:0xff,g:0xff,b:0}},
      {pct:1.0,color:{r:0x00,g:0xff,b:0}}];


  var numericFilter = function(x){
    return !isNaN(parseInt(x))
  }
  $scope.conf = $window.plugins["perf"]
  $scope.task = $window.task_data
  $scope.currentSample
  $scope.perftab = 1
  $scope.project = $window.project
  $scope.getThreadKeys = function(r){
    var keys = _.uniq(_.filter(_.flatten(_.map(r, function(x){ return _.keys(x.results) }), true), numericFilter))
    return keys
  }
 $scope.compareHash = ""
 $scope.compareSample = null

  $scope.getCompareColor =function(){
    return "black"
  }

  $scope.getCompareDescription = function(trendSample, taskSample){
    trendSample
    return ""
  }

  $scope.getSampleComparison = function(testname, thread){
    if($scope.compareSample == null)
      return
    testData = _.find($scope.compareSample.data.results, function(x){return x.name == testname})
    if(testData){
      return $scope.getMax(testData.results)
    }
  }

  $scope.getMax = function(r){
    return _.max(_.filter(_.pluck(_.values(r), 'ops_per_sec'), numericFilter))
  }

  var drawDetailGraph = function(sample1, sample2){
    for(var i=0;i<sample1.data.results.length;i++){
      $("#chart-" + $scope.task.id + "-" + i).empty()
      var testname = sample1.data.results[i].name
      var series = sample1.data.results[i].results
      var keys = _.filter(_.keys(sample1.data.results[i].results), numericFilter)
      var threadsVsOps = []
      for(var j=0;j<keys.length;j++){
        threadsVsOps.push({x:j, y:sample1.data.results[i].results[keys[j]].ops_per_sec})
      }

      var series = [{ color: 'lightblue', data: threadsVsOps}]
      if(!!sample2){
        var compareTest = _.find(sample2.data.results, function(x){return x.name == testname})
        if(compareTest && compareTest.results){
          var compareSeries = compareTest.series
          var compareKeys = _.filter(_.keys(sample2.data.results[i].results), numericFilter)
          var sample2ops = []
          for(var j=0;j<compareKeys.length;j++){
            sample2ops.push({x:j, y:sample2.data.results[i].results[keys[j]].ops_per_sec})
          }
        }
        series.push({ color: 'lightpink', data: sample2ops})
      }

      var graph = new Rickshaw.Graph( {
        element: document.querySelector("#chart-" + $scope.task.id + "-" + i), 
          width: 150, 
          height: 80, 
          renderer:"bar",
          stack:false,
          series: series,
          padding: {top: 0.2, left: 0.1, right: 0.1, bottom: 0.1},

      })

      var yAxis = new Rickshaw.Graph.Axis.Y({ graph: graph, ticks:2 });
      var x_axis = new Rickshaw.Graph.Axis.X({ 
        graph: graph, 
        orientation:"top",
        tickValues:_.map(keys, function(k){return parseInt(k)-.5}), 
         tickFormat:function(t){return Math.floor(t)+1}
      })
      graph.render();
    }
  }

  var drawTrendGraph = function(testKeys, testsByName, taskId, compareSample){
    for(var i=0;i<testKeys.length;i++){
      $("#perf-trendchart-" + taskId + "-" + i).empty()
      var key = testKeys[i]
        var w = 400
        var bw = 3
        var h = 100
        var svg = d3.select("#perf-trendchart-" + taskId + "-" + i)
        .append("svg")
        .attr('class',"series")
        .attr("width", 800)
        .attr("height", h);
      var series = testsByName[key]
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
          if(d.task_id == taskId){
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
        if(compareSample) {
          var compareTest = _.find(compareSample.data.results, function(x){return x.name == key})
          if(compareTest && compareTest.results){
            var compareMax = $scope.getMax(compareTest.results)
            var compareLine = d3.svg.line()
            .x(function(d, i){return x(i)})
            .y(function(d){ return y(compareMax)})

            svg.append("line")
            .attr("stroke","#6666FF")
            .attr("stroke-width","1")
            .attr("stroke-dasharray","5,5")
            .attr("class", "mean-line")
            .attr( {x1:x(0), x2:x(w), y1:y(compareMax), y2:y(compareMax)})
          }
        }

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
  }

  $scope.updateComparison = function(x){
    $scope.compareHash = x
    $http.get("/plugin/json/commit/" + $scope.project + "/" + $scope.compareHash + "/" + $scope.task.build_variant).success(function(d){
      $scope.compareSample = d
      drawDetailGraph($scope.sample, $scope.compareSample)
      drawTrendGraph($scope.testSeriesKeys, $scope.testSeriesByName, $scope.task.id, $scope.compareSample)
    }).error(function(){
      $scope.compareSample = null
    })
  }

  if($scope.conf.enabled){
    // Populate the graph and table for this task
    $http.get("/plugin/json/task/" + $scope.task.id + "/")
      .success(function(d){
        $scope.sample = d
        var w = 700
        var bw = 1
        var h = 100
        setTimeout(function(){drawDetailGraph($scope.sample)},0)
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
    
        setTimeout(function(){drawTrendGraph($scope.testSeriesKeys, $scope.testSeriesByName, $scope.task.id, null)},0)
      })
  }
}

