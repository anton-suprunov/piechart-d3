import * as d3 from 'd3';

const DEFAULTS = {
        radius : 60,
        hover : true, // enable hover interactions
        radiusDelta : 5,
        radiusHighlight : 3, //radius of the highlight arc
        move : 3, // how far will be moved hovered pie
        onhoverMove : 1, // how far will all pies be moved on svg hover
        decimals : 1,
        classNoVotes : 'chart__no-votes',
        classSelected : 'selected'
    },
    color = d3.scale.ordinal().range(['#e7de37', '#f5841e', '#eb6a67', '#86c778']),
    pieGenerator = d3.layout.pie().sort(null),
    // calculate average degree between two and convert to polar orientation by subtracting 450 degrees
    calculateAngle = data => ( ( 7.85 - ((data.startAngle + data.endAngle) / 2) ).toFixed(2) );

class Piechart {
    constructor(container, data, options = {}) {
        let self = this;

        this.container = d3.select(container);

        this.data = data;
        this.originalData = data;

        this.clicked = () => {};

        this.opts = Object.assign({}, options, DEFAULTS);
        this.opts.width = this.opts.height = this.opts.radius * 2;

        this.arcGenerator = d3.svg.arc()
            .outerRadius(this.opts.radius)
            .innerRadius(0);

        this.arcLargeGenerator = d3.svg.arc()
            .outerRadius(this.opts.radius + this.opts.radiusDelta)
            .innerRadius(0);

        this.arcHighlightGenerator = d3.svg.arc()
            .outerRadius(this.opts.radius)
            .innerRadius(this.opts.radius - this.opts.radiusHighlight);

        this.arcHighlightLargeGenerator = d3.svg.arc()
            .outerRadius(this.opts.radius + this.opts.radiusDelta)
            .innerRadius(this.opts.radius + this.opts.radiusDelta - this.opts.radiusHighlight);

        this.svg = this.container.append("svg")
            .attr("width", this.opts.width)
            .attr("height", this.opts.height);

        this.g = this.svg.append("g")
            .attr("transform", "translate(" + this.opts.width / 2 + "," + this.opts.height / 2 + ")");

        this.arc = this.g.selectAll(".arc")
            .data(pieGenerator(this.data.rates))
            .enter().append("g")
            .attr("class", "arc")
            .attr("index", (d, i) => i);

        this.path = this.arc.append("path")
            .attr("d", this.arcGenerator)
            .style({
                "fill": (d, i) => color(i)
            });

        this.pathHighlight = this.arc.append("path")
            .attr("d", this.arcHighlightGenerator)
            .attr('class', 'highlight')
            .style({
                "fill": '#fff'
            });
        
        this.svg
            .on('mouseenter', () => this._enableRateMode())
            .on('mouseleave', () => this._disableRateMode());

        this.arc
            .on('mouseover', function (d, i) {
                if (!self.touched) {
                    self._onmouseover(this, d);
                }
            })
            .on('mouseleave', function (d, i) {
                self._onmouseout(this, d);
            })
            .on('click', function (d, i) {
                self.clicked(this, d, i);
            })
            /*
            * support for rating on mobile:
            * on first tap enable rating mode
            * and trigger clicked event on second
            * */
            .on('touchstart', function(d, i) {
                d3.event.stopPropagation();

                function mobileTouchHandler() {
                    self.touched = false;
                    self._disableRateMode();
                    document.body.removeEventListener('touchstart', mobileTouchHandler);
                }

                if (!self.touched) {
                    self._enableRateMode();
                    self.touched = true;
                    document.body.addEventListener('touchstart', mobileTouchHandler);
                } else {
                    self.touched = false;
                    self.clicked(this, d, i);
                    self._disableRateMode();
                    document.body.removeEventListener('touchstart', mobileTouchHandler);
                }
            }); 

        if (data.rated !== false) {
           this.setSelectedArc(data.rated);
        }
    } // constructor


    refresh(data, keepOriginal, applyMargin) {
        let self = this;

        if (! keepOriginal) {
            this.originalData = data;
        }
        this.data = data;

        this.arc.data(pieGenerator(self.data.rates))
            .each(function(d) {
                let arc = d3.select(this),
                    transition;

                if (applyMargin){
                    transition = self._calculateTransform(calculateAngle(d), self.opts.onhoverMove);
                } else {
                    transition = '0,0';
                }
                arc.transition()
                    .duration(100)
                    .attr("transform", "translate(" + transition + ")");
            });

        this.arc.select('path')
            .each(function(d) {
                let path = d3.select(this);

                if (path.attr('hovered') === 'true') {
                    path.transition()
                        .duration(100)
                        .attr('d', self.arcLargeGenerator)
                } else {
                    path.transition()
                        .duration(100)
                        .attr('d', self.arcGenerator)
                }
            });

        this.arc.select('path.highlight')
            .each(function() {
                let path = d3.select(this);

                if (path.attr('hovered') === 'true') {
                    path.transition()
                        .duration(100)
                        .attr('d', self.arcHighlightLargeGenerator)
                } else {
                    path.transition()
                        .duration(100)
                        .attr('d', self.arcHighlightGenerator);
                }
            });

        this.container.select('.' + this.opts.classNoVotes).remove();

        if (this.data.rated !== this.selectedArc) {
            this.setSelectedArc(this.data.rated);
        }
    }

    toggleLoadingMode(loading) {
        this.container.classed('chart-loading', loading);
        if (loading) {
            //this.svg.attr('filter', 'url(#filter-glow-yellow');
        } else {
            //this.svg.attr('filter', '');
        }
    }

    setSelectedArc(index) {
        let selectedArc;

        this.arc.classed(this.opts.classSelected, false);
        if (! isNaN(index)) {
            selectedArc = this.svg.select('.arc[index="' + index + '"]');
            selectedArc.classed(this.opts.classSelected, true);
        }
        this.selectedArc = index;
        this._resetHovers();
    }

    getSelectedArc() {
        return this.selectedArc;
    }

    getData() {
        return this.data;
    }

    _calculateTransform(angle, move) {
        let newX = move * Math.cos(angle),
            newY = -1 * move * Math.sin(angle);

        return newX + ',' + newY;
    }

    _onmouseover(el, d) {
        let transition = this._calculateTransform(calculateAngle(d), this.opts.move),
            arc = d3.select(el),
            path = arc.select("path"),
            pathHighlight = arc.select("path.highlight");

        //console.log(el, d, transition);

        // skip full arc
        if (d.data === 100) {
            return;
        }

        arc.transition()
            .duration(150)
            .ease('quad')
            .attr("transform", "translate(" + transition + ")")
            .attr('hovered', true);

        path.transition()
            .duration(150)
            .ease('quad')
            .attr("d", this.arcLargeGenerator)
            //.attr('filter', 'url(#filter-drop-shadow')
            .attr('hovered', true);

        pathHighlight.transition()
            .duration(150)
            .ease('quad')
            .attr("d", this.arcHighlightLargeGenerator)
            .attr('hovered', true);
        
    }

    _onmouseout(el, d) {
        let arc = d3.select(el),
            path = arc.select("path"),
            pathHighlight = arc.select("path.highlight");

        arc.transition()
            .duration(100)
            .attr("transform", "translate(0,0)")
            .attr('hovered', false);

        path.transition()
            .duration(100)
            .attr("d", this.arcGenerator)
            //.attr('filter', '')
            .attr('hovered', false);

        pathHighlight.transition()
            .duration(100)
            .attr("d", this.arcHighlightGenerator)
            .attr('hovered', false);
    }

    _resetHovers() {
        let self = this,
            hovered = this.arc.filter('[hovered="true"]');

        if (!hovered.empty()) {
            hovered.each(function(d) { 
                self._onmouseout(this, d);
            });
        }

        this.arc.select('path').attr("transform", "translate(0,0)");
    }

    _enableRateMode() {
        this.refresh(Object.assign({}, this.originalData, {
            rates: [25, 25, 25, 25]
        }), true, true);
    }

    _disableRateMode() {
        this.refresh(this.originalData);
        this._resetHovers();
    }
}

export default Piechart;