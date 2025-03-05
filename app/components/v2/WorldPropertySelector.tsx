'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { WorldPropertyOption } from '../../types/worldV2';
import { Textarea } from '../ui/textarea';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface WorldPropertySelectorProps {
  properties: WorldPropertyOption[];
  selectedProperties: string[];
  onSelect: (selectedIds: string[]) => void;
  propertyDetails: Record<string, string>;
  onPropertyDetailChange: (id: string, detail: string) => void;
  disabled?: boolean;
}

export default function WorldPropertySelector({
  properties,
  selectedProperties,
  onSelect,
  propertyDetails,
  onPropertyDetailChange,
  disabled = false
}: WorldPropertySelectorProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(new Set());

  // 切换类别展开状态
  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  // 切换属性展开状态（用于显示详细描述输入框）
  const toggleProperty = (propertyId: string) => {
    const newExpanded = new Set(expandedProperties);
    if (newExpanded.has(propertyId)) {
      newExpanded.delete(propertyId);
    } else {
      newExpanded.add(propertyId);
    }
    setExpandedProperties(newExpanded);
  };

  // 切换选中状态
  const toggleSelection = (propertyId: string) => {
    const newSelected = [...selectedProperties];
    const index = newSelected.indexOf(propertyId);
    
    if (index >= 0) {
      newSelected.splice(index, 1);
    } else {
      newSelected.push(propertyId);
    }
    
    onSelect(newSelected);
  };

  // 全选
  const selectAll = () => {
    const allPropertyIds = getAllPropertyIds(properties);
    onSelect(allPropertyIds);
  };

  // 取消全选
  const deselectAll = () => {
    onSelect([]);
  };

  // 获取所有属性ID（包括子类别）
  const getAllPropertyIds = (props: WorldPropertyOption[]): string[] => {
    let ids: string[] = [];
    
    for (const prop of props) {
      ids.push(prop.id);
      if (prop.subcategories && prop.subcategories.length > 0) {
        ids = [...ids, ...getAllPropertyIds(prop.subcategories)];
      }
    }
    
    return ids;
  };

  // 递归渲染属性及其子类别
  const renderProperties = (props: WorldPropertyOption[], level = 0) => {
    return props.map(prop => (
      <div key={prop.id} className="mb-2">
        <div 
          className={`flex items-start space-x-2 pl-${level * 4} py-1`}
        >
          <Checkbox 
            id={`prop-${prop.id}`} 
            checked={selectedProperties.includes(prop.id)}
            onCheckedChange={() => toggleSelection(prop.id)}
            disabled={disabled}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="flex items-center">
              {prop.subcategories && prop.subcategories.length > 0 && (
                <button 
                  onClick={() => toggleCategory(prop.id)}
                  className="p-1 mr-1"
                >
                  {expandedCategories.has(prop.id) ? 
                    <ChevronDown className="h-4 w-4" /> : 
                    <ChevronRight className="h-4 w-4" />
                  }
                </button>
              )}
              <Label 
                htmlFor={`prop-${prop.id}`} 
                className="font-medium cursor-pointer"
              >
                {prop.name}
              </Label>
              {selectedProperties.includes(prop.id) && (
                <button 
                  onClick={() => toggleProperty(prop.id)}
                  className="ml-2 text-xs text-blue-500 hover:underline"
                >
                  {expandedProperties.has(prop.id) ? '收起详情' : '添加详情'}
                </button>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">{prop.description}</p>
            
            {/* 展示详细描述输入框 */}
            {selectedProperties.includes(prop.id) && expandedProperties.has(prop.id) && (
              <div className="mt-2 pl-6">
                <Textarea
                  placeholder={`为${prop.name}添加详细描述...`}
                  value={propertyDetails[prop.id] || ''}
                  onChange={(e) => onPropertyDetailChange(prop.id, e.target.value)}
                  className="min-h-[100px]"
                  disabled={disabled}
                />
              </div>
            )}
          </div>
        </div>

        {/* 渲染子类别 */}
        {prop.subcategories && prop.subcategories.length > 0 && expandedCategories.has(prop.id) && (
          <div className={`ml-${(level + 1) * 4} mt-2`}>
            {renderProperties(prop.subcategories, level + 1)}
          </div>
        )}
      </div>
    ));
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl flex justify-between items-center">
          <span>世界属性选择</span>
          <div className="space-x-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={selectAll}
              disabled={disabled}
            >
              全选
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={deselectAll}
              disabled={disabled}
            >
              取消全选
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          {properties.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              请先生成世界属性选项
            </div>
          ) : (
            renderProperties(properties)
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
} 